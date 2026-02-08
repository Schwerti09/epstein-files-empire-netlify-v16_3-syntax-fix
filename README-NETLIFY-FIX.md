# Netlify Fix (Base Directory)

Netlify hat `package.json` nicht im Repo-Root gefunden.  
Diese Version packt den Code in `/epstein-files` und setzt **im Repo-Root** eine `netlify.toml` mit:

- `base = "epstein-files"`
- `command = "npm run build"`
- `publish = "site"`

→ Import in Netlify sollte ohne weitere UI-Settings deployen.

Code liegt hier:
- `epstein-files/`
