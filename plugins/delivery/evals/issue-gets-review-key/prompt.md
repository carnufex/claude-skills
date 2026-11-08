---
description: A bug report becomes an issue whose review key decides by itself and fails today.
tags: [delivery, review-key]
max_turns: 25
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
---

Skriv ett issue för den här buggen, men skapa det inte på GitHub: lägg hela issuetexten i issue.md i den här mappen.

POST /api/users svarar 500 när e-postadressen innehåller ett plustecken, till exempel anna+test@example.com. Användaren ska skapas som vanligt, precis som för adresser utan plustecken.
