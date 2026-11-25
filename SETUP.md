# Node + Express + EJS Starter Guide

A beginner-friendly guide to setting up **any** website project with Node.js, Express and EJS. Follow it top to bottom the first time. Next time, jump to the [Quick Start Checklist](#quick-start-checklist).

---

## The big picture (read this first)

| Tool | What it is | Think of it as... |
| --- | --- | --- |
| **Node.js** | Lets you run JavaScript on your computer (not just in a browser) | The engine |
| **npm** | Comes with Node. Downloads other people's code (packages) | An app store for code |
| **Express** | A package that makes it easy to build a web server | The waiter: takes requests, brings back pages |
| **EJS** | A package that lets you put JavaScript inside HTML files | HTML with blanks you can fill in |
| **nodemon** | A package that restarts your server when you save a file | Auto-refresh for your server |

**How a page gets to your browser:**

```
Browser asks for /about  →  Express finds the "/about" route  →  renders views/about.ejs  →  sends HTML back
```

---

## Step 1: Install the basics (one time only)

1. Download and install **Node.js (LTS version)** from <https://nodejs.org>.
2. Open a terminal (in VS Code: **Terminal → New Terminal**) and check it worked:

   ```bash
   node -v
   npm -v
   ```

   Both should print a version number. If you get "not recognized", restart VS Code or your computer.

3. Install **nodemon** globally (one time, works for all projects):

   ```bash
   npm install -g nodemon
   ```

---

## Step 2: Create the project

```bash
mkdir my-project
cd my-project
npm init -y
```

- `mkdir` makes a folder. `cd` moves into it.
- `npm init -y` creates a **`package.json`**, which is your project's ID card and list of installed packages.

---

## Step 3: Edit `package.json`

Open `package.json` and make two changes:

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "main": "index.js",
  "type": "module",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  }
}
```

| Change | Why |
| --- | --- |
| `"type": "module"` | Lets you write modern `import express from "express"` instead of the older `require(...)` |
| `"start"` and `"dev"` scripts | Shortcuts so you can type `npm start` or `npm run dev` |

> Keep any other lines (like `dependencies`) that are already in your file. Just add the ones above.

---

## Step 4: Install the packages

```bash
npm install express ejs
```

This creates a `node_modules/` folder (hundreds of files). That's normal.
**Never edit it, and never upload it to GitHub.** It can always be rebuilt with `npm install`.

---

## Step 5: Create the folders and files

```
my-project/
├── index.js              ← your server
├── package.json
├── public/               ← files the browser can download directly
│   ├── styles/
│   │   └── style.css
│   └── images/
└── views/                ← your EJS pages
    ├── index.ejs
    └── partials/         ← reusable pieces (header, footer)
        ├── header.ejs
        └── footer.ejs
```

Create all the folders **and** empty files with one command (run it inside your project folder):

```bash
mkdir -p public/styles public/images views/partials && touch index.js public/styles/style.css views/index.ejs views/partials/header.ejs views/partials/footer.ejs
```

- `mkdir -p` creates the folders (and any missing parent folders).
- `touch` creates empty files. You fill them in during the next steps.
- Use **Git Bash** or the VS Code bash terminal. In plain Windows PowerShell, `touch` doesn't exist.

**Two folder names matter:**

- **`views/`**: Express automatically looks here for `.ejs` files.
- **`public/`**: anything in here is available to the browser. `public/styles/style.css` becomes `/styles/style.css`. (You never write "public" in the link.)

---

## Step 6: Write the server (`index.js`)

```js
import express from "express";

const app = express();
const port = 3000;

// 1. Let the browser load CSS, images, etc. from the "public" folder
app.use(express.static("public"));

// 2. Routes: "when someone visits this URL, show this page"
app.get("/", (req, res) => {
  res.render("index.ejs");
});

app.get("/about", (req, res) => {
  res.render("about.ejs");
});

// 3. Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
```

**Adding a new page later = 2 steps:**

1. Create `views/newpage.ejs`
2. Add a route:

   ```js
   app.get("/newpage", (req, res) => {
     res.render("newpage.ejs");
   });
   ```

---

## Step 7: Make the reusable pieces (partials)

Instead of copying your menu and footer into every page, write them once.

**`views/partials/header.ejs`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/styles/style.css">
  <title>My Site</title>
</head>
<body>
  <nav>
    <a href="/">Home</a>
    <a href="/about">About</a>
  </nav>
  <main>
```

**`views/partials/footer.ejs`**

```html
  </main>
  <footer>
    <p>Made by me</p>
  </footer>
</body>
</html>
```

Notice the header **opens** tags (`<html>`, `<body>`, `<main>`) and the footer **closes** them. They only make sense as a pair.

**Any page** then looks like this (`views/index.ejs`):

```ejs
<%- include("partials/header.ejs") %>

<h1>Home Page</h1>
<p>Hello world!</p>

<%- include("partials/footer.ejs") %>
```

> **Use `<%- ... %>` (with a dash) for includes.** `<%= ... %>` would print the HTML as plain text instead of using it.

---

## Step 8: Run it

Pick one:

```bash
npm run dev     # recommended: restarts automatically when you save
npm start       # plain Node: you must stop and restart after every change to index.js
```

You should see:

```
Server running on port 3000
```

Now open **<http://localhost:3000>** in your browser.

To stop the server: click the terminal and press **Ctrl + C**.

**What refreshes when?**

| You changed... | What you need to do |
| --- | --- |
| `.ejs`, `.css`, images | Just refresh the browser |
| `index.js` | Restart the server (nodemon does this for you) |

---

## Troubleshooting

| What you see | What it means / fix |
| --- | --- |
| `Cannot use import statement outside a module` | Add `"type": "module"` to `package.json` (Step 3) |
| `Cannot find module 'express'` | Run `npm install express ejs` in the project folder |
| `EADDRINUSE: address already in use :::3000` | Another server is already on port 3000. Close the other terminal (Ctrl + C) or change `port` in `index.js` |
| `Cannot GET /something` | No route for that URL. Add one in `index.js` (Step 6) |
| `Failed to lookup view "x.ejs"` | The file isn't in `views/`, or the name is spelled differently |
| `npm start` says "Missing script" | Add the `scripts` from Step 3 |
| `nodemon is not recognized` | Run `npm install -g nodemon`, then reopen the terminal |
| Page shows with no styling | Check `app.use(express.static("public"))` exists and your CSS link starts with `/` (like `/styles/style.css`) |
| Header or footer appears as text | You used `<%= %>` instead of `<%- %>` |
| Edited a file but nothing changed | Hard refresh with **Ctrl + Shift + R**, since the browser may have cached the old version |

---

## Quick Start Checklist

For your next project, run this and fill in the files from the steps above:

```bash
mkdir my-project && cd my-project
npm init -y
npm install express ejs
mkdir -p public/styles public/images views/partials && touch index.js public/styles/style.css views/index.ejs views/partials/header.ejs views/partials/footer.ejs
```

Then:

- [ ] In `package.json`: add `"type": "module"` and the `start` / `dev` scripts
- [ ] Create `index.js` (Step 6)
- [ ] Create `views/partials/header.ejs` and `footer.ejs` (Step 7)
- [ ] Create `views/index.ejs`
- [ ] Run `npm run dev` and open <http://localhost:3000>

---

## Bonus: things you'll use soon

**Send data to a page** (a variable in the route, shown in the template):

```js
app.get("/", (req, res) => {
  res.render("index.ejs", { name: "Kyle" });
});
```

```ejs
<h1>Hello, <%= name %>!</h1>
```

**Read a submitted form** (add this near the top of `index.js`, after `app.use(express.static(...))`):

```js
app.use(express.urlencoded({ extended: true }));

app.post("/contact", (req, res) => {
  console.log(req.body); // { name: "...", email: "..." }
  res.redirect("/");
});
```

The form needs `<form action="/contact" method="POST">`.

**Ignore `node_modules` in git:** create a file named `.gitignore` containing:

```
node_modules/
```
