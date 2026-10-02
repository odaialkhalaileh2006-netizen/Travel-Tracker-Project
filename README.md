# Travel Tracker

A small web app for marking the countries you've visited on a world map. Everyone in the family gets their own tab and their own color, and each person's map is saved in PostgreSQL.

<!-- Add a screenshot: save it as docs/screenshot.png, then uncomment the next line. -->
<!-- ![Travel Tracker screenshot](docs/screenshot.png) -->

## Features

- One tab per family member, each with a color and a running country count
- Add a country by typing its name (exact names win; partial names work too)
- Remove a country you added by mistake
- Clear messages for typos, ambiguous names and duplicates
- Each page has its own URL (`/users/2`), so a refresh or a shared link opens the right map

## Tech stack

Node.js, Express, EJS templates, PostgreSQL (`pg`), and an inline SVG world map.

## Getting started

You need Node.js 18.11 or newer and a running PostgreSQL server.

```bash
git clone https://github.com/<your-username>/travel-tracker.git
cd travel-tracker
npm install

createdb travel_tracker
psql -d travel_tracker -f db/schema.sql

cp .env.example .env     # then put your own PostgreSQL password in .env
npm start
```

Open http://localhost:3000. On first run you'll be asked to add the first family member. `npm run dev` restarts the server when you edit files.

### Already have the older tables?

If your database came from an earlier version of this project, `visited_countries` may allow duplicates. Clean them up once:

```sql
DELETE FROM visited_countries a USING visited_countries b
WHERE a.user_id = b.user_id AND a.country_code = b.country_code AND a.id > b.id;

ALTER TABLE visited_countries ADD CONSTRAINT visited_unique UNIQUE (user_id, country_code);
```

Then point `PGDATABASE` in `.env` at your existing database.

## Project structure

```
index.js              routes and database queries
views/index.ejs       map page (tabs, add form, visited list, SVG map)
views/new.ejs         "Add a family member" page
public/styles/        main.css (map), new.css (color picker), app.css (tabs, notices)
db/schema.sql         tables plus a countries list that matches the map
```

## Routes

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/` | Opens the first member's map (or the sign-up page on first run) |
| GET | `/users/new` | Add-member form |
| POST | `/users` | Creates a member |
| GET | `/users/:id` | Shows that member's map |
| POST | `/users/:id/countries` | Adds a country |
| POST | `/users/:id/countries/:code/delete` | Removes a country |

## Known limitations

- There are no logins: anyone who can open the site can edit any member's map.
- Country names are English only, and nicknames like "USA" don't match.
- No automated tests yet.

## License

[MIT](LICENSE)
