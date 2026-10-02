import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

const db = new pg.Pool();

const COLORS = ["red", "orange", "yellow", "olive", "green", "teal", "blue", "violet", "purple", "pink"];

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const json = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
const userIdFrom = (req) => Number.parseInt(req.params.id, 10);

async function getUsers() {
  const { rows } = await db.query(
    `SELECT u.id, u.name, u.color, COUNT(v.id)::int AS total
     FROM users u
     LEFT JOIN visited_countries v ON v.user_id = u.id
     GROUP BY u.id
     ORDER BY u.id`
  );
  return rows;
}

async function getVisited(userId) {
  const { rows } = await db.query(
    `SELECT c.country_code, c.country_name
     FROM visited_countries v
     JOIN countries c ON c.country_code = v.country_code
     WHERE v.user_id = $1
     ORDER BY c.country_name`,
    [userId]
  );
  return rows;
}

// Renders one family member's map. Returns false if that member doesn't exist.
async function renderMap(res, userId, { status = 200, error } = {}) {
  const users = await getUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return false;
  const countries = await getVisited(userId);
  res.status(status).render("index.ejs", {
    users,
    user,
    countries,
    error,
    data: json({ codes: countries.map((c) => c.country_code), color: user.color }),
  });
  return true;
}

// Which country did the person mean? Exact name first, then a partial match.
async function findCountry(input) {
  const exact = await db.query(
    "SELECT country_code, country_name FROM countries WHERE LOWER(country_name) = LOWER($1)",
    [input]
  );
  if (exact.rows.length) return exact.rows;
  const escaped = input.replace(/[\\%_]/g, "\\$&");
  const partial = await db.query(
    "SELECT country_code, country_name FROM countries WHERE country_name ILIKE '%' || $1 || '%' ORDER BY country_name",
    [escaped]
  );
  return partial.rows;
}

// Open the first family member's map, or the sign-up page on first run.
app.get("/", wrap(async (req, res) => {
  const { rows } = await db.query("SELECT id FROM users ORDER BY id LIMIT 1");
  res.redirect(rows.length ? `/users/${rows[0].id}` : "/users/new");
}));

app.get("/users/new", wrap(async (req, res) => {
  const { rows } = await db.query("SELECT 1 FROM users LIMIT 1");
  res.render("new.ejs", { colors: COLORS, canCancel: rows.length > 0 });
}));

app.post("/users", wrap(async (req, res) => {
  const name = (req.body.name || "").trim();
  const color = req.body.color;
  const fail = (error) =>
    res.status(400).render("new.ejs", { colors: COLORS, canCancel: true, error, name, color });

  if (!name || name.length > 15) return fail("Enter a name of 15 characters or fewer.");
  if (!COLORS.includes(color)) return fail("Pick a color.");

  try {
    const { rows } = await db.query(
      "INSERT INTO users (name, color) VALUES ($1, $2) RETURNING id",
      [name, color]
    );
    res.redirect(`/users/${rows[0].id}`);
  } catch (err) {
    if (err.code === "23505") return fail(`${name} is already on the map. Pick a different name.`);
    throw err;
  }
}));

app.get("/users/:id", wrap(async (req, res) => {
  const found = await renderMap(res, userIdFrom(req));
  if (!found) res.redirect("/");
}));

app.post("/users/:id/countries", wrap(async (req, res) => {
  const userId = userIdFrom(req);
  const input = (req.body.country || "").trim();
  const fail = async (error) => {
    if (!(await renderMap(res, userId, { status: 400, error }))) res.redirect("/");
  };

  if (!input) return fail("Type a country name.");

  const matches = await findCountry(input);
  if (matches.length === 0) return fail(`No country matches "${input}". Check the spelling and try again.`);
  if (matches.length > 1) {
    const options = matches.slice(0, 5).map((m) => m.country_name).join(", ");
    return fail(`"${input}" matches several countries (${options}). Type the full name.`);
  }

  const { country_code, country_name } = matches[0];
  try {
    const result = await db.query(
      `INSERT INTO visited_countries (country_code, user_id)
       SELECT $1::char(2), $2::int
       WHERE NOT EXISTS (
         SELECT 1 FROM visited_countries WHERE country_code = $1::char(2) AND user_id = $2::int
       )`,
      [country_code, userId]
    );
    if (result.rowCount === 0) return fail(`${country_name} is already on this map.`);
  } catch (err) {
    if (err.code === "23503") return res.redirect("/"); 
    throw err;
  }
  res.redirect(`/users/${userId}`);
}));

app.post("/users/:id/countries/:code/delete", wrap(async (req, res) => {
  const userId = userIdFrom(req);
  if (/^[A-Z]{2}$/.test(req.params.code) && Number.isInteger(userId)) {
    await db.query("DELETE FROM visited_countries WHERE user_id = $1 AND country_code = $2", [
      userId,
      req.params.code,
    ]);
  }
  res.redirect(`/users/${userId}`);
}));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Something went wrong on our end. Check the server logs.");
});

try {
  await db.query("SELECT 1");
} catch (err) {
  console.error("Can't reach PostgreSQL. Check the PG* settings in your .env file.\n", err.message);
  process.exit(1);
}

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
