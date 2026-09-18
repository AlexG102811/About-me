# Replit notes

## Running the project

The project is a dependency-free static homepage. Replit runs it with:

```bash
python3 -m http.server 5000
```

The managed `Start application` workflow serves the site in the preview.

## Customizing the page

Update the placeholder name, copy, project details, and email link in `index.html`. Visitors can also use **Edit profile** in the header to change the personal details shown on the page; those edits are saved in that browser with `localStorage`. Visual styles live in `styles.css`, and the mobile menu, settings panel, and dynamic copyright year live in `script.js`.