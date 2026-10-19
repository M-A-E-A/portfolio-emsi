# API REST Contacts — Express.js

Preuve concrète pour la compétence **Node.js & Express** affichée dans le
portfolio. Contrairement à la démo « API REST Contacts » du portfolio (qui est
une simulation côté navigateur), celle-ci est une vraie API Express, avec un
serveur Node, des routes, de la validation et des codes HTTP réels.

## Lancement

```bash
cd api-express
npm install
npm start
```

Puis ouvrir `http://localhost:3000/api/contacts`.

En développement, `npm run dev` relance le serveur à chaque modification.

## Routes

| Méthode | Chemin | Description |
|---------|--------|-------------|
| GET | `/api/contacts` | liste, recherche (`q`), filtre (`ville`), tri (`tri`, `ordre`), pagination (`page`, `parPage`) |
| GET | `/api/contacts/:id` | un contact, ou 404 |
| POST | `/api/contacts` | création, validation, 201 |
| PUT | `/api/contacts/:id` | mise à jour, 400 si invalide, 404 si absent |
| DELETE | `/api/contacts/:id` | suppression, 204 |
| GET | `/api/stats` | total et répartition par ville |

## Exemples

```bash
# Liste paginée
curl "http://localhost:3000/api/contacts?page=1&parPage=2"

# Recherche
curl "http://localhost:3000/api/contacts?q=bennani"

# Création
curl -X POST http://localhost:3000/api/contacts \
  -H 'Content-Type: application/json' \
  -d '{"nom":"Test","email":"test@example.com","ville":"Marrakech"}'

# Suppression
curl -X DELETE http://localhost:3000/api/contacts/2
```

## Ce que ça démontre

- Routing Express (`app.get/post/put/delete`)
- Middleware (`express.json`, journalisation, gestion d'erreurs)
- Codes HTTP réels : 200, 201, 204, 400, 404, 500
- Validation des entrées et messages d'erreur structurés
- Pagination, tri et recherche côté serveur
- Organisation en couches (données, validation, routes, erreurs)

Les données sont en mémoire : l'API se lance sans base de données ni
configuration. C'est volontaire — la démonstration porte sur Express, pas sur
l'infrastructure.