require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const winston = require('winston');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const FtpSrv = require('ftp-srv');

// ==================== CONFIGURATION ====================
const app = express();
const PORT = 3003;
const FTP_PORT = 2121;

// [VULN-001] JWT_SECRET faible et prévisible - facilement crackable
// Hint dans /backup/jwt_config.txt accessible via FTP
const JWT_SECRET = 'emsi-ctf-2024';

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

// ==================== LOGGER ====================
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({ format: winston.format.combine(winston.format.colorize(), winston.format.simple()) })
    ]
});

if (!fs.existsSync('logs')) fs.mkdirSync('logs');

// ==================== CHEMINS ====================
const BASES_PATH = path.join(__dirname, '..', 'Ressources', 'Bases de question');
const EXAMENS_PATH = path.join(__dirname, '..', 'Examens');
const CONFIG_PATH = path.join(__dirname, 'config.json');
const USERS_PATH = path.join(__dirname, 'users.json');
const SESSIONS_PATH = path.join(__dirname, 'sessions.json');
const HISTORY_PATH = path.join(__dirname, 'history.json');

// ==================== MIDDLEWARES ====================
// [VULN-002] Helmet désactivé partiellement - headers d'info exposés
app.use(helmet({ contentSecurityPolicy: false, hidePoweredBy: false }));
app.use(compression());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// [VULN-007] Verbose error logging middleware - exposé dans les réponses
app.use((req, res, next) => {
    res.sendError = (status, message, err) => {
        const payload = { error: message };
        // [VULN-007] Stack trace exposé en mode dev
        if (err) { payload.stack = err.stack; payload.details = err.message; }
        res.status(status).json(payload);
    };
    next();
});

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10000, message: { error: 'Trop de requêtes' } });
app.use('/api/', limiter);

// ==================== DONNÉES ====================
const SITES = ['Casablanca', 'Rabat', 'Meknes'];

let examConfig = {
    dureeExamen: 50, nombreQCM: 8, nombreGraphQcm: 8, nombreRedaction: 4,
    questionsExclues: {}, examActif: true,
    messageAccueil: "Bienvenue sur la plateforme d'examen ENSAM"
};

let users = { professeurs: [] };
let examensEnCours = new Map();
let actionHistory = [];
let questionsCache = null;

// Scores RedTeam par session
const redteamScores = new Map();

// ==================== CACHE QUESTIONS ====================
function chargerCacheBases() {
    try {
        const fichiers = fs.readdirSync(BASES_PATH).filter(f => f.endsWith('.json'));
        const matieres = new Map();
        const questions = new Map();
        fichiers.forEach(fichier => {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(BASES_PATH, fichier), 'utf8'));
                questions.set(fichier, data);
                const key = (data.matiere || fichier.replace('.json', '')).toLowerCase();
                if (!matieres.has(key)) matieres.set(key, { id: key, nom: data.matiere || fichier.replace('.json', '') });
            } catch (e) {}
        });
        questionsCache = { matieres, questions };
    } catch (e) { logger.error('Cache bases error', { error: e.message }); }
}

function invaliderCacheBases() { questionsCache = null; }

// ==================== SESSIONS ====================
function sauvegarderSessions() {
    try {
        const d = {};
        examensEnCours.forEach((v, k) => { d[k] = v; });
        fs.writeFileSync(SESSIONS_PATH, JSON.stringify(d, null, 2), 'utf8');
    } catch (e) {}
}

function chargerSessions() {
    try {
        if (fs.existsSync(SESSIONS_PATH)) {
            const data = JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'));
            Object.entries(data).forEach(([k, v]) => examensEnCours.set(k, v));
        }
    } catch (e) {}
}

setInterval(sauvegarderSessions, 30000);

// ==================== HISTORIQUE ====================
function logAction(action, user, details) {
    const entry = { id: uuidv4(), timestamp: new Date().toISOString(), action, user: user || 'system', details };
    actionHistory.push(entry);
    if (actionHistory.length > 1000) actionHistory = actionHistory.slice(-1000);
    try {
        let history = fs.existsSync(HISTORY_PATH) ? JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')) : [];
        history.push(entry);
        if (history.length > 5000) history = history.slice(-5000);
        fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
    } catch (e) {}
    io.emit('action', entry);
}

// ==================== CONFIG / USERS ====================
function chargerConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) examConfig = { ...examConfig, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    } catch (e) {}
}

function sauvegarderConfig() {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(examConfig, null, 2), 'utf8');
}

function chargerUsers() {
    try {
        if (fs.existsSync(USERS_PATH)) {
            users = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
        } else {
            users = { professeurs: [{ id: 'prof1', username: 'admin', password: bcrypt.hashSync('admin123', 10), nom: 'Administrateur', role: 'admin', createdAt: new Date().toISOString() }] };
            fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), 'utf8');
        }
    } catch (e) {}
}

function sauvegarderUsers() { fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), 'utf8'); }

chargerConfig();
chargerUsers();
chargerSessions();
chargerCacheBases();

// ==================== AUTH MIDDLEWARE ====================
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token requis' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Token invalide' });
    }
}

// ==================== UTILITAIRES ====================
function sanitiserSegment(str) {
    return String(str || '').replace(/[^a-zA-Z0-9 \-_\u00C0-\u024F]/g, '').trim().substring(0, 64);
}

function chargerQuestions(matiere) {
    const questions = { qcm: [], redaction: [], graphQcm: [] };
    try {
        if (!questionsCache) chargerCacheBases();
        const matiereSearch = matiere.toLowerCase().replace(/_/g, ' ');
        questionsCache.questions.forEach((data, fichier) => {
            const matiereNorm = (data.matiere || '').toLowerCase();
            if (matiereNorm.includes(matiereSearch) || matiereSearch.includes(matiereNorm) || fichier.toLowerCase().includes(matiere.toLowerCase())) {
                const typeRaw = (data.type || '').toLowerCase();
                const isQcm = typeRaw === 'qcm';
                const isRedaction = typeRaw.startsWith('red') || typeRaw.includes('daction');
                const isGraphQcm = typeRaw.includes('graph');
                if (isQcm) questions.qcm.push(...(data.questions || []));
                else if (isRedaction) questions.redaction.push(...(data.questions || []));
                else if (isGraphQcm) questions.graphQcm.push(...(data.questions || []));
            }
        });
    } catch (e) { logger.error('Erreur chargement questions', { error: e.message }); }
    return questions;
}

function melangerTableau(t) {
    const c = [...t];
    for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
    return c;
}

function genererExamen(matiere) {
    const questions = chargerQuestions(matiere);
    const exclusions = examConfig.questionsExclues?.[matiere] || { qcm: [], redaction: [], graphQcm: [] };
    return {
        qcm: melangerTableau(questions.qcm.filter(q => !exclusions.qcm?.includes(q.id) && !q.exclue)).slice(0, examConfig.nombreQCM),
        redaction: melangerTableau(questions.redaction.filter(q => !exclusions.redaction?.includes(q.id) && !q.exclue)).slice(0, examConfig.nombreRedaction),
        graphQcm: melangerTableau(questions.graphQcm.filter(q => !exclusions.graphQcm?.includes(q.id) && !q.exclue)).slice(0, examConfig.nombreGraphQcm)
    };
}

function creerDossierEtudiant(site, matiere, groupe, nom, prenom) {
    const nomSafe = sanitiserSegment(nom).replace(/\s+/g, '-').toUpperCase();
    const prenomSafe = sanitiserSegment(prenom).replace(/\s+/g, '-').toUpperCase();
    const dossierPath = path.join(EXAMENS_PATH, sanitiserSegment(site), sanitiserSegment(matiere), sanitiserSegment(groupe).replace(/\s+/g, '-'), `${nomSafe}_${prenomSafe}`);
    if (!fs.existsSync(dossierPath)) fs.mkdirSync(dossierPath, { recursive: true });
    return dossierPath;
}

function calculerNote(examen, reponses) {
    let noteQcm = 0, noteGraphQcm = 0, noteRedaction = 0;
    let maxQcm = 0, maxGraphQcm = 0, maxRedaction = 0;
    const detailQCM = [], detailGraphQCM = [], questionsRedaction = [];

    examen.qcm.forEach((q, i) => {
        const points = q.points || 1; maxQcm += points;
        const rep = reponses.qcm?.[i]; const correct = rep === q.reponse;
        if (correct) noteQcm += points;
        detailQCM.push({ question: q.question, options: q.options, reponseEtudiant: rep, reponseCorrecte: q.reponse, correct, points: correct ? points : 0, pointsMax: points });
    });

    examen.graphQcm.forEach((q, i) => {
        const points = q.points || 2; maxGraphQcm += points;
        const rep = reponses.graphQcm?.[i]; let score = 0;
        if (q.type === 'ordre' && rep && q.reponse_ordre) score = JSON.stringify(rep) === JSON.stringify(q.reponse_ordre) ? points : 0;
        else if (q.type === 'association' && rep && q.associations) { let b = 0; q.associations.forEach(([g, d]) => { if (rep[g] === d) b++; }); score = Math.round((b / q.associations.length) * points); }
        else if (q.type === 'classification' && rep && q.elements) { let b = 0; q.elements.forEach((el, idx) => { if (rep[idx] === el.categorie) b++; }); score = Math.round((b / q.elements.length) * points); }
        noteGraphQcm += score;
        detailGraphQCM.push({ question: q.question, type: q.type, reponseEtudiant: rep, points: score, pointsMax: points });
    });

    examen.redaction.forEach((q, i) => {
        const points = q.points || 5; maxRedaction += points;
        const rep = reponses.redaction?.[i] || '';
        const motsCles = q.mots_cles || [];
        let motsPresents = 0;
        motsCles.forEach(m => { if (rep.toLowerCase().includes(m.toLowerCase())) motsPresents++; });
        const score = motsCles.length > 0 ? Math.round((motsPresents / motsCles.length) * points) : 0;
        noteRedaction += score;
        questionsRedaction.push({ question: q.question, reponse: rep, points: score, pointsMax: points, mots_cles: motsCles, motsPresents });
    });

    const total = noteQcm + noteGraphQcm + noteRedaction;
    const totalMax = maxQcm + maxGraphQcm + maxRedaction;
    return {
        qcm: noteQcm, graphQcm: noteGraphQcm, redaction: noteRedaction,
        total, totalMax, pourcentage: totalMax > 0 ? Math.round((total / totalMax) * 100) : 0,
        noteSur20: totalMax > 0 ? Math.round((total / totalMax) * 20 * 10) / 10 : 0,
        detailQCM, detailGraphQCM, questionsRedaction
    };
}

// ==================== REDTEAM SCORING ====================
const REDTEAM_PHASES = {
    reconnaissance:   { points: 10, label: 'Reconnaissance',      description: 'Découverte de la surface d\'attaque' },
    weaponization:    { points: 15, label: 'Armement',            description: 'Préparation de l\'exploit' },
    exploitation:     { points: 20, label: 'Exploitation',         description: 'Exploitation d\'une vulnérabilité' },
    privilege_escalation: { points: 25, label: 'Élévation de privilèges', description: 'Obtention d\'un accès administrateur' },
    c2:               { points: 15, label: 'Commande & Contrôle', description: 'Établissement d\'un accès persistant' },
    lateral_movement: { points: 10, label: 'Mouvement Latéral',   description: 'Accès aux données d\'autres étudiants' },
    actions:          { points: 30, label: 'Actions sur objectifs','description': 'Consultation des réponses ou modification de note' }
};

function getOrCreateRedteamScore(sessionId) {
    if (!redteamScores.has(sessionId)) {
        redteamScores.set(sessionId, {
            phases: {},
            totalPoints: 0,
            flags: []
        });
    }
    return redteamScores.get(sessionId);
}

function enregistrerPhase(sessionId, phase, details) {
    const score = getOrCreateRedteamScore(sessionId);
    if (score.phases[phase]) return false; // Déjà validée
    const phaseInfo = REDTEAM_PHASES[phase];
    if (!phaseInfo) return false;
    score.phases[phase] = { completedAt: new Date().toISOString(), points: phaseInfo.points, details };
    score.totalPoints += phaseInfo.points;
    score.flags.push({ phase, timestamp: new Date().toISOString() });
    // Notifier le prof via WebSocket
    io.emit('redteam-phase-completed', { sessionId, phase, points: phaseInfo.points, totalPoints: score.totalPoints });
    logger.info('[REDTEAM] Phase complétée', { sessionId, phase, points: phaseInfo.points });
    return true;
}

// ==================== WEBSOCKET ====================
io.on('connection', (socket) => {
    socket.on('join-exam', (sessionId) => socket.join(`exam-${sessionId}`));
    socket.on('auto-save', (data) => {
        const { sessionId, reponses } = data;
        const exam = examensEnCours.get(sessionId);
        if (exam && !exam.soumis) { exam.reponsesTemp = reponses; exam.lastSave = new Date().toISOString(); socket.emit('save-confirmed', { timestamp: exam.lastSave }); }
    });
});

function notifierProfs(event, data) { io.emit('prof-notification', { event, data, timestamp: new Date().toISOString() }); }

// ==================== ROUTES PUBLIQUES ====================

// [VULN-009] robots.txt expose les endpoints cachés
app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send([
        'User-agent: *',
        'Disallow: /api/debug',
        'Disallow: /api/admin',
        'Disallow: /backup/',
        'Disallow: /api/examen/answers/',
        'Disallow: /api/export',
        'Disallow: /api/webhook',
        'Disallow: /api/config/merge',
        'Disallow: /api/bases/import-unsafe',
        'Disallow: /api/feedback',
        '# FTP disponible sur le port 2121 (accès anonyme)',
        '# Contact: admin@emsi-edu.ma'
    ].join('\n'));
});

// [VULN-002] Endpoint debug sans authentification - expose les secrets
app.get('/api/debug', (req, res) => {
    logger.warn('[VULN-002] Accès endpoint /api/debug', { ip: req.ip });
    // Cette route est automatiquement détectée par les scanners (robots.txt)
    res.json({
        server: 'EMSI Exam Platform v3 (CTF Edition)',
        environment: 'staging',
        jwt_secret: JWT_SECRET,             // Secret JWT exposé !
        jwt_algorithm: 'HS256',
        users: users.professeurs,           // Hash des mots de passe exposés !
        config: examConfig,
        sessions_active: examensEnCours.size,
        server_path: __dirname,
        node_version: process.version,
        endpoints: [
            'GET  /api/debug                   (this endpoint - no auth)',
            'GET  /api/export?fichier=          (VULN-012 - path traversal)',
            'GET  /api/examen/answers/:id       (VULN-003 - IDOR answers)',
            'POST /api/admin/create-user        (VULN-008 - master key: EMSI-MASTER-KEY-2024)',
            'GET  /api/professeur/stats         (VULN-005 - no auth)',
            'GET  /api/professeur/corrections   (VULN-005 - no auth)',
            'PUT  /api/profil/update            (VULN-014 - mass assignment role escalation)',
            'POST /api/webhook/test             (VULN-015 - SSRF internal network)',
            'POST /api/config/merge             (VULN-018 - prototype pollution)',
            'POST /api/bases/import-unsafe      (VULN-019 - insecure deserialization + eval)',
            'POST /api/feedback                 (VULN-020 - log injection)',
            'POST /api/auth/login               (VULN-013 no lockout, VULN-016 type confusion)',
            'GET  /api/auth/redirect?redirect=  (VULN-017 - open redirect)',
        ],
        ftp: { host: req.hostname, port: FTP_PORT, user: 'anonymous', password: '' }
    });
});

app.get('/api/config', (req, res) => {
    res.json({ sites: SITES, examActif: examConfig.examActif, messageAccueil: examConfig.messageAccueil, dureeExamen: examConfig.dureeExamen });
});

app.get('/api/matieres', (req, res) => {
    try {
        if (!questionsCache) chargerCacheBases();
        res.json(Array.from(questionsCache.matieres.values()));
    } catch (e) { res.json([]); }
});

// ==================== API EXAMEN ====================
app.post('/api/examen/start', (req, res) => {
    const { nom, prenom, groupe, site, matiere, mode } = req.body;
    if (!nom || !prenom || !groupe || !site || !matiere) return res.status(400).json({ error: 'Tous les champs sont requis' });
    if (!examConfig.examActif) return res.status(403).json({ error: 'Examens désactivés' });

    // Vérifier reprise
    for (const [id, exam] of examensEnCours) {
        if (exam.nom === nom && exam.prenom === prenom && exam.matiere === matiere && !exam.soumis) {
            if (new Date() > new Date(exam.heureFin)) return res.status(403).json({ error: 'Session expirée' });
            return res.json({
                sessionId: id, qcm: exam.examen.qcm.map(q => ({ id: q.id, question: q.question, options: q.options })),
                redaction: exam.examen.redaction, graphQcm: exam.examen.graphQcm,
                heureFin: exam.heureFin, duree: examConfig.dureeExamen, reprise: true, reponsesTemp: exam.reponsesTemp,
                mode: exam.mode || 'normal'
            });
        }
    }

    const sessionId = uuidv4();
    const examen = genererExamen(matiere);
    const heureDebut = new Date();
    const heureFin = new Date(heureDebut.getTime() + examConfig.dureeExamen * 60000);
    const dossier = creerDossierEtudiant(site, matiere, groupe, nom, prenom);
    const modeExamen = mode === 'redteam' ? 'redteam' : mode === 'freestyle' ? 'freestyle' : 'normal';

    examensEnCours.set(sessionId, {
        nom, prenom, groupe, site, matiere, examen,
        heureDebut: heureDebut.toISOString(), heureFin: heureFin.toISOString(),
        dossier, soumis: false, note: null, reponsesTemp: null, mode: modeExamen, violations: []
    });

    if (modeExamen === 'redteam') {
        getOrCreateRedteamScore(sessionId);
        logger.info('[REDTEAM] Nouvelle session RedTeam', { sessionId, nom, prenom });
    }

    logAction('EXAM_START', `${prenom} ${nom}`, { sessionId, site, matiere, groupe, mode: modeExamen });
    notifierProfs('exam-started', { sessionId, nom, prenom, site, matiere, groupe, mode: modeExamen });

    res.json({
        sessionId,
        qcm: examen.qcm.map(q => ({ id: q.id, question: q.question, options: q.options })),
        redaction: examen.redaction, graphQcm: examen.graphQcm,
        heureFin: heureFin.toISOString(), duree: examConfig.dureeExamen, mode: modeExamen
    });
});

// [VULN-004] Grade override via paramètre caché _note
app.post('/api/examen/submit', (req, res) => {
    const { sessionId, reponses, _note } = req.body;
    const examData = examensEnCours.get(sessionId);
    if (!examData) return res.status(404).json({ error: 'Session non trouvée' });
    if (examData.soumis) return res.status(400).json({ error: 'Examen déjà soumis', note: examData.note });

    const note = calculerNote(examData.examen, reponses);

    // [VULN-004] Paramètre _note permet de fixer la note manuellement
    if (_note !== undefined && !isNaN(parseFloat(_note))) {
        const noteOverride = Math.min(20, Math.max(0, parseFloat(_note)));
        logger.warn('[VULN-004] Grade override détecté!', { sessionId, originalNote: note.noteSur20, overrideNote: noteOverride });
        note.noteSur20 = noteOverride;
        note.total = Math.round((noteOverride / 20) * note.totalMax);
        note._overridden = true;
        // Enregistrer la phase "actions" pour le mode RedTeam
        if (examData.mode === 'redteam') enregistrerPhase(sessionId, 'actions', { method: 'grade_override', note: noteOverride });
    }

    examData.soumis = true; examData.note = note;
    examData.reponses = reponses; examData.heureSoumission = new Date().toISOString();

    const resultat = {
        etudiant: { nom: examData.nom, prenom: examData.prenom, groupe: examData.groupe, site: examData.site },
        matiere: examData.matiere, heureDebut: examData.heureDebut, heureSoumission: examData.heureSoumission,
        note, reponses, detailQCM: note.detailQCM, detailGraphQCM: note.detailGraphQCM,
        questionsRedaction: note.questionsRedaction, violations: examData.violations || [],
        redteamScore: examData.mode === 'redteam' ? redteamScores.get(sessionId) : null
    };

    fs.writeFileSync(path.join(examData.dossier, 'resultats.json'), JSON.stringify(resultat, null, 2), 'utf8');
    logAction('EXAM_SUBMIT', `${examData.prenom} ${examData.nom}`, { sessionId, note: note.noteSur20 });
    notifierProfs('exam-submitted', { sessionId, nom: examData.nom, prenom: examData.prenom, note: note.noteSur20 });
    res.json({ success: true, note });
});

app.post('/api/examen/autosave', (req, res) => {
    const { sessionId, reponses } = req.body;
    const exam = examensEnCours.get(sessionId);
    if (!exam || exam.soumis) return res.status(400).json({ error: 'Session invalide' });
    exam.reponsesTemp = reponses; exam.lastSave = new Date().toISOString();
    res.json({ success: true, timestamp: exam.lastSave });
});

// [VULN-003] IDOR - Consultation des réponses correctes sans vérification d'identité
app.get('/api/examen/answers/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const exam = examensEnCours.get(sessionId);
    if (!exam) return res.status(404).json({ error: 'Session non trouvée' });

    logger.warn('[VULN-003] IDOR Answers - Accès aux réponses', { sessionId, ip: req.ip });

    // Enregistrer la phase RedTeam si applicable
    if (exam.mode === 'redteam') {
        enregistrerPhase(sessionId, 'exploitation', { method: 'idor_answers' });
        enregistrerPhase(sessionId, 'actions', { method: 'view_answers' });
    }

    // AUCUNE vérification que le demandeur est le propriétaire de la session!
    res.json({
        sessionId,
        etudiant: `${exam.prenom} ${exam.nom}`,
        matiere: exam.matiere,
        answers: {
            qcm: exam.examen.qcm.map((q, i) => ({
                index: i, question: q.question, options: q.options,
                reponse_correcte: q.reponse,      // Réponse correcte exposée!
                reponse_correcte_texte: q.options?.[q.reponse]
            })),
            redaction: exam.examen.redaction.map((q, i) => ({
                index: i, question: q.question,
                mots_cles: q.mots_cles,           // Mots clés de correction exposés!
                reponse_type: q.reponse_type || 'Voir mots-clés'
            }))
        },
        message: 'IDOR Vulnerability - No ownership check performed'
    });
});

// [VULN-008] Anti-triche désactivé (endpoint existe mais ne rejette pas)
app.post('/api/examen/anticheat', (req, res) => {
    const { sessionId, type } = req.body;
    const exam = examensEnCours.get(sessionId);
    if (!exam) return res.status(400).json({ error: 'Session invalide' });
    if (!exam.violations) exam.violations = [];
    exam.violations.push({ type, timestamp: new Date().toISOString() });
    // [VULN-008] Violation loggée mais aucune action prise !
    res.json({ success: true, message: 'Noted (but ignored)', totalViolations: exam.violations.length });
});

// ==================== AUTHENTIFICATION ====================
// [VULN-013] Aucun rate limiting ni lockout sur le login - brute force possible
// [VULN-016] Type confusion / NoSQL-style injection bypass
app.post('/api/auth/login', async (req, res) => {
    // Accepte nom/motDePasse ET username/password
    const nom = req.body.username || req.body.nom;
    const motDePasse = req.body.password || req.body.motDePasse;

    const user = users.professeurs.find(u => u.username === nom || u.nom === nom);
    if (!user) {
        logAction('LOGIN_FAIL', nom || 'unknown', { ip: req.ip });
        return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // [VULN-016] Pas de vérification du type - type confusion bypass
    if (typeof motDePasse !== 'string') {
        logger.warn('[VULN-016] Type confusion login attempt', { nom, type: typeof motDePasse, value: JSON.stringify(motDePasse) });
        if (motDePasse && motDePasse['$ne'] !== undefined) {
            logger.warn('[VULN-016] AUTH BYPASS via type confusion!', { nom });
            const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
            logAction('LOGIN_BYPASS', nom, { ip: req.ip, method: 'type_confusion' });
            return res.json({ token, user: { id: user.id, username: user.username, nom: user.nom, role: user.role }, vuln: 'VULN-016 Auth bypass triggered' });
        }
        return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // [VULN-013] Aucun compteur de tentatives échouées
    const valid = await bcrypt.compare(motDePasse, user.password);
    if (!valid) {
        logAction('LOGIN_FAIL', nom, { ip: req.ip });
        return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // [VULN-017] Open Redirect - redirect param renvoyé sans validation
    const redirectUrl = req.body.redirect || req.query.redirect;
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    logAction('LOGIN', nom, { ip: req.ip });
    res.json({ token, user: { id: user.id, username: user.username, nom: user.nom, role: user.role }, redirect: redirectUrl });
});

// [VULN-017] Open Redirect endpoint
app.get('/api/auth/redirect', (req, res) => {
    const { token, redirect } = req.query;
    if (!token) return res.status(400).send('<h2>Token manquant</h2>');
    try {
        jwt.verify(token, JWT_SECRET);
        logger.warn('[VULN-017] Open Redirect', { redirect, ip: req.ip });
        // Aucune validation du domaine de destination !
        if (redirect) return res.redirect(redirect);
        res.redirect('/professeur.html');
    } catch (e) {
        res.status(401).send('<h2>Token invalide</h2>');
    }
});

app.get('/api/auth/verify', authMiddleware, (req, res) => res.json({ valid: true, user: req.user }));

// ==================== API PROFESSEUR ====================

// [VULN-005] Stats accessibles sans authentification
app.get('/api/professeur/stats', (req, res) => {  // Pas de authMiddleware!
    logger.warn('[VULN-005] Accès non authentifié à /api/professeur/stats', { ip: req.ip });
    const stats = { total: examensEnCours.size, enCours: 0, soumis: 0, parSite: {}, parMatiere: {}, sessions: [] };
    examensEnCours.forEach((exam, id) => {
        if (exam.soumis) stats.soumis++; else stats.enCours++;
        // [VULN-005] SessionIds exposés - permet l'IDOR sur /api/examen/answers
        stats.sessions.push({ sessionId: id, nom: exam.nom, prenom: exam.prenom, matiere: exam.matiere, soumis: exam.soumis });
    });
    res.json(stats);
});

// [VULN-005] Liste corrections sans authentification
app.get('/api/professeur/corrections', (req, res) => {  // Pas de authMiddleware!
    logger.warn('[VULN-005] Accès non authentifié à /api/professeur/corrections', { ip: req.ip });
    const corrections = [];
    try {
        if (fs.existsSync(EXAMENS_PATH)) {
            const walk = (dir, depth = 0) => {
                if (depth > 4) return;
                fs.readdirSync(dir).forEach(f => {
                    const p = path.join(dir, f);
                    if (fs.statSync(p).isDirectory()) walk(p, depth + 1);
                    else if (f === 'resultats.json') {
                        try {
                            const data = JSON.parse(fs.readFileSync(p, 'utf8'));
                            corrections.push({ chemin: path.relative(EXAMENS_PATH, path.dirname(p)), etudiant: data.etudiant, note: data.note, matiere: data.matiere });
                        } catch (e) {}
                    }
                });
            };
            walk(EXAMENS_PATH);
        }
    } catch (e) {}
    res.json(corrections);
});

app.get('/api/professeur/examens', authMiddleware, (req, res) => {
    const examens = [];
    examensEnCours.forEach((exam, id) => { examens.push({ id, ...exam, examen: undefined }); });
    res.json(examens.sort((a, b) => new Date(b.heureDebut) - new Date(a.heureDebut)));
});

app.get('/api/professeur/history', authMiddleware, (req, res) => {
    try {
        const h = fs.existsSync(HISTORY_PATH) ? JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')) : [];
        res.json(h.slice(-100).reverse());
    } catch (e) { res.json([]); }
});

// [VULN-010] Endpoint C2 - création de compte avec clé hardcodée
app.post('/api/admin/create-user', (req, res) => {
    const { masterKey, username, password, role } = req.body;
    logger.warn('[VULN-010] Tentative accès endpoint C2 /api/admin/create-user', { ip: req.ip, username });

    // [VULN-010] Clé hardcodée dans le code (et dans backup/deploy_notes.txt via FTP)
    if (masterKey !== 'EMSI-MASTER-KEY-2024') {
        return res.status(403).json({ error: 'Accès refusé' });
    }

    if (!username || !password) return res.status(400).json({ error: 'username et password requis' });
    if (users.professeurs.find(u => u.username === username)) return res.status(400).json({ error: 'Utilisateur existe déjà' });

    const newUser = { id: uuidv4(), username, password: bcrypt.hashSync(password, 10), nom: username, role: role || 'admin', createdAt: new Date().toISOString() };
    users.professeurs.push(newUser);
    sauvegarderUsers();
    logAction('C2_USER_CREATE', 'backdoor', { username, role: newUser.role });

    res.json({ success: true, user: { id: newUser.id, username, role: newUser.role }, token: jwt.sign({ id: newUser.id, username, role: newUser.role }, JWT_SECRET, { expiresIn: '8h' }) });
});

// Gestion utilisateurs (authentifiée)
app.get('/api/professeur/users', authMiddleware, (req, res) => {
    res.json(users.professeurs.map(u => ({ id: u.id, username: u.username, nom: u.nom, role: u.role })));
});

app.post('/api/professeur/users', authMiddleware, async (req, res) => {
    const { username, password, nom, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Données manquantes' });
    if (users.professeurs.find(u => u.username === username)) return res.status(400).json({ error: 'Utilisateur existe déjà' });
    const newUser = { id: uuidv4(), username, password: await bcrypt.hash(password, 10), nom: nom || username, role: role || 'prof', createdAt: new Date().toISOString() };
    users.professeurs.push(newUser);
    sauvegarderUsers();
    res.json({ success: true, user: { id: newUser.id, username, nom: newUser.nom, role: newUser.role } });
});

// Config
app.get('/api/professeur/config', authMiddleware, (req, res) => res.json(examConfig));
app.post('/api/professeur/config', authMiddleware, (req, res) => {
    examConfig = { ...examConfig, ...req.body };
    sauvegarderConfig();
    res.json({ success: true, config: examConfig });
});

// Bases de questions
app.get('/api/professeur/bases', authMiddleware, (req, res) => {
    try {
        if (!questionsCache) chargerCacheBases();
        const bases = [];
        questionsCache.questions.forEach((data, fichier) => {
            bases.push({ fichier, matiere: data.matiere, type: data.type, count: (data.questions || []).length });
        });
        res.json(bases);
    } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

// [VULN-011] XSS Stocké — endpoint raw sans sanitisation (doit être AVANT corrections/:chemin)
// Déplacé ici pour éviter que Express ne matche 'raw' avec le paramètre :chemin
app.get('/api/professeur/corrections/raw', (req, res) => {  // Pas de authMiddleware — VULN-005 aussi!
    const corrections = [];
    try {
        if (fs.existsSync(EXAMENS_PATH)) {
            const walk = (dir, depth = 0) => {
                if (depth > 4) return;
                fs.readdirSync(dir).forEach(f => {
                    const p = path.join(dir, f);
                    if (fs.statSync(p).isDirectory()) walk(p, depth + 1);
                    else if (f === 'resultats.json') {
                        try {
                            const data = JSON.parse(fs.readFileSync(p, 'utf8'));
                            // [VULN-011] Données brutes sans échappement — XSS si affiché via innerHTML
                            corrections.push({
                                nom: data.etudiant?.nom,
                                prenom: data.etudiant?.prenom,
                                note: data.note?.noteSur20,
                                matiere: data.matiere
                            });
                        } catch (e) {}
                    }
                });
            };
            walk(EXAMENS_PATH);
        }
    } catch (e) {}
    res.setHeader('X-XSS-Hint', 'Try: nom=<img src=x onerror=alert(document.cookie)>');
    res.json(corrections);
});

// Corrections (authentifiée)
app.get('/api/professeur/corrections/:chemin', authMiddleware, (req, res) => {
    const fullPath = path.resolve(EXAMENS_PATH, decodeURIComponent(req.params.chemin), 'resultats.json');
    if (!fullPath.startsWith(path.resolve(EXAMENS_PATH) + path.sep)) return res.status(403).json({ error: 'Accès refusé' });
    try { res.json(JSON.parse(fs.readFileSync(fullPath, 'utf8'))); } catch (e) { res.status(404).json({ error: 'Copie non trouvée' }); }
});

app.post('/api/professeur/corrections/save', authMiddleware, (req, res) => {
    const { chemin, resultats } = req.body;
    const fullPath = path.resolve(EXAMENS_PATH, chemin, 'resultats.json');
    if (!fullPath.startsWith(path.resolve(EXAMENS_PATH) + path.sep)) return res.status(403).json({ error: 'Accès refusé' });
    try { fs.writeFileSync(fullPath, JSON.stringify(resultats, null, 2), 'utf8'); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

// Preview
app.get('/api/professeur/preview/:matiere', authMiddleware, (req, res) => {
    const examen = genererExamen(req.params.matiere);
    res.json({ qcm: examen.qcm, redaction: examen.redaction, graphQcm: examen.graphQcm, duree: examConfig.dureeExamen });
});

// ==================== REDTEAM SCORING API ====================
app.get('/api/redteam/score/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const exam = examensEnCours.get(sessionId);
    if (!exam) return res.status(404).json({ error: 'Session non trouvée' });
    const score = redteamScores.get(sessionId) || { phases: {}, totalPoints: 0, flags: [] };
    const totalPossible = Object.values(REDTEAM_PHASES).reduce((s, p) => s + p.points, 0);
    res.json({
        sessionId, mode: exam.mode,
        score: { ...score, totalPossible, pourcentage: Math.round((score.totalPoints / totalPossible) * 100) },
        phases: REDTEAM_PHASES,
        completedPhases: Object.keys(score.phases)
    });
});

// Enregistrement manuel d'une phase (avec preuve)
app.post('/api/redteam/flag', (req, res) => {
    const { sessionId, phase, evidence } = req.body;
    const exam = examensEnCours.get(sessionId);
    if (!exam || exam.mode !== 'redteam') return res.status(400).json({ error: 'Session RedTeam invalide' });

    // Validation des preuves selon la phase
    const ev = (evidence || '').toLowerCase();
    const validations = {
        reconnaissance:       () => ev.includes('robots') || ev.includes('ftp') || ev.includes('2121') || ev.includes('deploy_notes') || ev.includes('jwt_config') || ev.includes('disallow'),
        weaponization:        () => ev.includes('eyj') || ev.includes('jwt') || ev.includes('emsi-ctf') || ev.includes('hs256'),
        exploitation:         () => ev.includes('reponse_correcte') || ev.includes('answers') || ev.includes('reponse_modele') || ev.includes('qcm'),
        privilege_escalation: () => ev.includes('eyj') || ev.includes('ctfadmin') || ev.includes('r3dt3am') || ev.includes('master') || ev.includes('token'),
        c2:                   () => ev.includes('jwt_secret') || ev.includes('emsi-ctf-2024') || ev.includes('activeSession') || ev.includes('nodeversion') || ev.includes('debug'),
        lateral_movement:     () => ev.includes('total') || ev.includes('etudiant') || ev.includes('moyenne') || ev.includes('corrections') || ev.includes('stats'),
        actions:              () => ev.includes('overridden') || ev.includes('notesur20') || ev.includes('override') || (ev.includes('20') && ev.includes('succes'))
    };

    const validator = validations[phase];
    if (validator && !validator()) return res.status(400).json({ error: 'Preuve insuffisante ou incorrecte', hint: 'Fournissez une preuve concrète de votre découverte' });

    const gained = enregistrerPhase(sessionId, phase, { evidence, submittedAt: new Date().toISOString() });
    const score = redteamScores.get(sessionId);

    if (gained) {
        res.json({ success: true, phase, pointsGagnes: REDTEAM_PHASES[phase].points, totalPoints: score.totalPoints, message: `Phase "${REDTEAM_PHASES[phase].label}" validée !` });
    } else {
        res.json({ success: false, message: 'Phase déjà validée', totalPoints: score.totalPoints });
    }
});

// Stats RedTeam pour le prof (toutes sessions)
app.get('/api/professeur/redteam', authMiddleware, (req, res) => {
    const results = [];
    redteamScores.forEach((score, sessionId) => {
        const exam = examensEnCours.get(sessionId);
        results.push({
            sessionId, etudiant: exam ? `${exam.prenom} ${exam.nom}` : 'Inconnu',
            matiere: exam?.matiere, totalPoints: score.totalPoints,
            totalPossible: Object.values(REDTEAM_PHASES).reduce((s, p) => s + p.points, 0),
            phasesCompleted: Object.keys(score.phases).length,
            phases: score.phases
        });
    });
    res.json(results.sort((a, b) => b.totalPoints - a.totalPoints));
});

// ==================== NOUVELLES VULNÉRABILITÉS (VULN-012 à VULN-020) ====================
// VULN-011 est déclaré plus haut (avant corrections/:chemin pour éviter le conflit de routing)

// [VULN-012] Path Traversal - lecture de fichiers arbitraires du système
app.get('/api/export', (req, res) => {
    const fichier = req.query.fichier || req.query.file || req.query.path;
    if (!fichier) return res.status(400).json({ error: 'Paramètre fichier requis. Ex: /api/export?fichier=resultats/etudiant.json' });
    logger.warn('[VULN-012] Path Traversal attempt', { fichier, ip: req.ip });
    try {
        // [VULN-012] Aucune validation du chemin - traversée possible avec ../
        // Exemple: /api/export?fichier=../../server-vuln.js
        const fullPath = path.join(EXAMENS_PATH, fichier);
        if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Fichier non trouvé', tried: fullPath });
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            return res.json({ type: 'directory', contents: fs.readdirSync(fullPath) });
        }
        const content = fs.readFileSync(fullPath, 'utf8');
        res.type('text/plain').send(content);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// [VULN-014] Mass Assignment - update profil sans liste blanche
app.put('/api/profil/update', authMiddleware, (req, res) => {
    const user = users.professeurs.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    logger.warn('[VULN-014] Mass Assignment profil update', { userId: req.user.id, fields: Object.keys(req.body) });
    // [VULN-014] Object.assign sans whitelist → permet d'écraser role, password, etc.
    Object.assign(user, req.body);
    sauvegarderUsers();
    res.json({ success: true, user: { id: user.id, username: user.username, nom: user.nom, role: user.role }, vuln: 'VULN-014: all fields written, including role' });
});

// [VULN-015] SSRF - webhook sans validation d'URL
app.post('/api/webhook/test', authMiddleware, async (req, res) => {
    const { url, method = 'GET', body: webhookBody, headers: webhookHeaders } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requise. Ex: {"url":"http://127.0.0.1:22"}' });
    logger.warn('[VULN-015] SSRF webhook request', { url, method, ip: req.ip });
    try {
        // [VULN-015] Aucune validation de l'URL - SSRF vers services internes possible
        // Exemples: http://127.0.0.1:22 (SSH), http://169.254.169.254 (AWS metadata)
        const opts = { method, headers: { 'Content-Type': 'application/json', ...(webhookHeaders || {}) }, signal: AbortSignal.timeout(5000) };
        if (webhookBody && method !== 'GET') opts.body = JSON.stringify(webhookBody);
        const response = await fetch(url, opts);
        const text = await response.text();
        res.json({ status: response.status, statusText: response.statusText, headers: Object.fromEntries(response.headers), body: text.substring(0, 4000), vuln: 'VULN-015: SSRF - internal network probed' });
    } catch (e) {
        // L'erreur révèle aussi des informations sur l'infrastructure interne
        res.json({ error: e.message, code: e.code, cause: e.cause?.message, vuln: 'VULN-015: error response reveals internal state' });
    }
});

// [VULN-018] Prototype Pollution via deep merge de configuration
app.post('/api/config/merge', authMiddleware, (req, res) => {
    logger.warn('[VULN-018] Prototype Pollution - deep merge config', { payload: JSON.stringify(req.body).substring(0, 300) });

    function mergeDeep(target, source) {
        for (const key of Object.keys(source)) {
            if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                // [VULN-018] Merge sur __proto__ pollue Object.prototype pour tous les objets !
                mergeDeep(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    mergeDeep(examConfig, req.body);
    sauvegarderConfig();

    // Vérification de la pollution
    const polluted = ({}).isAdmin;
    if (polluted) {
        logger.warn('[VULN-018] Prototype POLLUÉ! isAdmin=', polluted);
    }

    res.json({
        success: true,
        config: examConfig,
        prototype_pollution_test: { 'isAdmin': ({}).isAdmin, 'polluted': !!polluted },
        vuln: polluted ? 'VULN-018: Object.prototype POLLUTED!' : 'VULN-018: Try payload {"__proto__":{"isAdmin":true}}'
    });
});

// [VULN-019] Insecure Deserialization - import avec eval
app.post('/api/bases/import-unsafe', authMiddleware, (req, res) => {
    const { data, filename } = req.body;
    if (!data) return res.status(400).json({ error: 'data requis' });
    logger.warn('[VULN-019] Insecure deserialization import', { filename, ip: req.ip });
    try {
        // [VULN-019] Reviver JSON exécute les valeurs préfixées par __eval__:
        // Exemple: {"questions": [{"id": "__eval__:process.env"}]}
        const parsed = JSON.parse(data, (key, value) => {
            if (typeof value === 'string' && value.startsWith('__eval__:')) {
                const code = value.replace('__eval__:', '');
                logger.warn('[VULN-019] eval() déclenché!', { key, code });
                try { return eval(code); } catch(e) { return `eval_error: ${e.message}`; }
            }
            return value;
        });
        const fichier = (filename || ('import_unsafe_' + Date.now())) + '.json';
        const fullPath = path.join(BASES_PATH, fichier);
        fs.writeFileSync(fullPath, JSON.stringify(parsed, null, 2));
        invaliderCacheBases();
        chargerCacheBases();
        res.json({ success: true, fichier, matiere: parsed.matiere, questions: (parsed.questions || []).length, vuln: 'VULN-019: Try __eval__:process.version in any string field' });
    } catch (e) {
        res.status(400).json({ error: 'Import invalide: ' + e.message });
    }
});

// [VULN-020] Log Injection / Log Forging
app.post('/api/feedback', (req, res) => {
    const { message, nom, email } = req.body;
    if (!message || !nom) return res.status(400).json({ error: 'message et nom requis' });
    // [VULN-020] Concaténation directe dans le log - injection de fausses lignes possible
    // Payload: nom = "Admin\n[2026-04-07] LOGIN admin SUCCESS from 127.0.0.1"
    logger.info('[FEEDBACK] De: ' + nom + ' <' + (email || 'no-email') + '> | Message: ' + message);
    // Fix: logger.info('[FEEDBACK]', { nom, email, message }); // structured logging
    res.json({ success: true, message: 'Merci pour votre retour !', vuln: 'VULN-020: Try nom with \\n to inject fake log lines' });
});

// [VULN-013] Endpoint explicite de brute force (pas de lockout)
app.get('/api/auth/bruteforce-info', (req, res) => {
    res.json({
        hint: 'VULN-013: No rate limiting or account lockout on /api/auth/login',
        weak_accounts: 'Check users.json via FTP - look for weak passwords',
        tip: 'Try common passwords: admin123, password, 123456, emsi2024, R3dT3am2024',
        rockyou: 'Offline bcrypt crack: hashcat -a 0 -m 3200 <hash> rockyou.txt'
    });
});

// ==================== FTP SERVER ====================
// [VULN-006] Serveur FTP anonyme - accès en lecture seule aux fichiers du serveur
function demarrerFTP() {
    try {
        const ftpServer = new FtpSrv({
            url: `ftp://0.0.0.0:${FTP_PORT}`,
            anonymous: true,
            pasv_range: '30000-31000',
            greeting: [
                '=== EMSI Exam Platform FTP Server ===',
                'Anonymous access enabled (read-only)',
                'Server path: ' + __dirname
            ]
        });

        ftpServer.on('login', ({ connection, username }, resolve) => {
            logger.warn('[VULN-006] Connexion FTP anonyme', { username, ip: connection.ip });
            // Accès en lecture seule à tout le répertoire du serveur
            resolve({ root: __dirname });
        });

        ftpServer.on('client-error', ({ connection, context, error }) => {
            logger.error('[FTP] Erreur client', { error: error.message });
        });

        ftpServer.listen().then(() => {
            logger.info(`[FTP] Serveur démarré sur le port ${FTP_PORT} (accès anonyme lecture seule)`);
        }).catch(err => {
            logger.error('[FTP] Impossible de démarrer le serveur FTP', { error: err.message });
        });
    } catch (e) {
        logger.error('[FTP] Erreur initialisation', { error: e.message });
    }
}

// ==================== DÉMARRAGE ====================
server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║     🎓 ENSAM Exam Platform - CTF Red Team Edition        ║
╠══════════════════════════════════════════════════════════╣
║  🌐 HTTP  sur le port ${PORT}                              ║
║  📁 FTP   sur le port ${FTP_PORT} (anonyme, lecture seule)    ║
╠══════════════════════════════════════════════════════════╣
║  👨‍🎓 Étudiants:   http://localhost:${PORT}/                ║
║  👨‍🏫 Professeur:  http://localhost:${PORT}/professeur.html ║
╠══════════════════════════════════════════════════════════╣
║  ⚠️  MODE CTF - Vulnérabilités intentionnelles           ║
║     Ne pas exposer sur un réseau de production!          ║
╚══════════════════════════════════════════════════════════╝
    `);
    demarrerFTP();
});

process.on('SIGINT', () => { sauvegarderSessions(); process.exit(0); });
process.on('SIGTERM', () => { sauvegarderSessions(); process.exit(0); });
