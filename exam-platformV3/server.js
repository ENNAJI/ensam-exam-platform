require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const helmet = require('helmet');
const compression = require('compression');
const winston = require('winston');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// ==================== CONFIGURATION ====================
const app = express();
const PORT = process.env.PORT || 3003;
const JWT_SECRET = process.env.JWT_SECRET || 'emsi-exam-platform-v3-secret-2024';
if (!process.env.JWT_SECRET) {
    console.warn('[SECURITE] JWT_SECRET non défini dans les variables d\'environnement. Utilisez un secret fort en production via la variable JWT_SECRET.');
}

// Créer serveur HTTP (HTTPS en production)
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ==================== LOGGER WINSTON ====================
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.File({ filename: 'logs/actions.log', level: 'info' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Créer dossier logs
if (!fs.existsSync('logs')) fs.mkdirSync('logs');

// ==================== CHEMINS ====================
// Support Railway volume (/data) ou chemin local par défaut
const DATA_ROOT   = process.env.RAILWAY_VOLUME_PATH || path.join(__dirname, '..');
const BASES_PATH  = process.env.BASES_PATH   || path.join(DATA_ROOT, 'Ressources', 'Bases de question');
const EXAMENS_PATH= process.env.EXAMENS_PATH || path.join(DATA_ROOT, 'Examens');
const CONFIG_PATH = path.join(__dirname, 'config.json');
const USERS_PATH  = path.join(__dirname, 'users.json');
const SESSIONS_PATH = path.join(__dirname, 'sessions.json');
const HISTORY_PATH  = path.join(__dirname, 'history.json');

// ==================== MIDDLEWARES ====================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { error: 'Trop de requêtes, réessayez plus tard' }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Trop de tentatives de connexion' }
});

// ==================== DONNÉES ====================
const SITES = ['Casablanca', 'Rabat', 'Meknes'];

let examConfig = {
    dureeExamen: 50,
    nombreQCM: 10,
    nombreGraphQcm: 10,
    nombreRedaction: 3,
    questionsExclues: {},
    examActif: true,
    messageAccueil: "Bienvenue sur la plateforme d'examen ENSAM"
};

let users = { professeurs: [] };
let examensEnCours = new Map();
let actionHistory = [];

// ==================== CACHE DES BASES DE QUESTIONS ====================
let questionsCache = null; // { matieres: Map<key, {id, nom}>, questions: Map<fichier, data> }

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
                if (!matieres.has(key)) {
                    matieres.set(key, { id: key, nom: data.matiere || fichier.replace('.json', '') });
                }
            } catch (e) {
                logger.warn('Impossible de charger la base', { fichier, error: e.message });
            }
        });
        questionsCache = { matieres, questions };
        logger.info('Cache bases chargé', { fichiers: fichiers.length, matieres: matieres.size });
    } catch (error) {
        logger.error('Erreur chargement cache bases', { error: error.message });
    }
}

function invaliderCacheBases() {
    questionsCache = null;
}

// ==================== PERSISTANCE DES SESSIONS ====================
function sauvegarderSessions() {
    try {
        const sessionsData = {};
        examensEnCours.forEach((value, key) => {
            sessionsData[key] = value;
        });
        fs.writeFileSync(SESSIONS_PATH, JSON.stringify(sessionsData, null, 2), 'utf8');
        logger.info('Sessions sauvegardées', { count: examensEnCours.size });
    } catch (error) {
        logger.error('Erreur sauvegarde sessions', { error: error.message });
    }
}

function chargerSessions() {
    try {
        if (fs.existsSync(SESSIONS_PATH)) {
            const data = JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'));
            Object.entries(data).forEach(([key, value]) => {
                examensEnCours.set(key, value);
            });
            logger.info('Sessions chargées', { count: examensEnCours.size });
        }
    } catch (error) {
        logger.error('Erreur chargement sessions', { error: error.message });
    }
}

// Auto-save sessions toutes les 30 secondes
setInterval(sauvegarderSessions, 30000);

// Nettoyage des sessions expirées toutes les heures
function nettoyerSessionsExpirees() {
    const maintenant = new Date();
    const DUREE_RETENTION_MS = 24 * 60 * 60 * 1000; // 24h
    let supprimees = 0;
    for (const [id, exam] of examensEnCours) {
        const heureFin = new Date(exam.heureFin);
        const expireDepuis = maintenant - heureFin;
        if (exam.soumis && expireDepuis > DUREE_RETENTION_MS) {
            examensEnCours.delete(id);
            supprimees++;
        } else if (!exam.soumis && expireDepuis > DUREE_RETENTION_MS) {
            // Session abandonnée : marquer comme expirée et conserver encore 24h
            exam.abandonnee = true;
            examensEnCours.delete(id);
            supprimees++;
        }
    }
    if (supprimees > 0) {
        logger.info('Sessions expirées nettoyées', { supprimees, restantes: examensEnCours.size });
        sauvegarderSessions();
    }
}
setInterval(nettoyerSessionsExpirees, 60 * 60 * 1000);

// ==================== HISTORIQUE DES ACTIONS ====================
function logAction(action, user, details) {
    const entry = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        action,
        user: user || 'system',
        details
    };
    actionHistory.push(entry);
    
    // Garder seulement les 1000 dernières actions en mémoire
    if (actionHistory.length > 1000) {
        actionHistory = actionHistory.slice(-1000);
    }
    
    // Sauvegarder dans fichier
    try {
        let history = [];
        if (fs.existsSync(HISTORY_PATH)) {
            history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
        }
        history.push(entry);
        // Garder les 5000 dernières dans le fichier
        if (history.length > 5000) {
            history = history.slice(-5000);
        }
        fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
    } catch (e) {}
    
    logger.info(`Action: ${action}`, { user, details });
    
    // Notifier via WebSocket
    io.emit('action', entry);
}

// ==================== CHARGEMENT CONFIG/USERS ====================
function chargerConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            examConfig = { ...examConfig, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
        }
    } catch (error) {
        logger.warn('Configuration par défaut utilisée');
    }
}

function sauvegarderConfig() {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(examConfig, null, 2), 'utf8');
    logAction('CONFIG_UPDATE', 'system', { config: examConfig });
}

function chargerUsers() {
    try {
        if (fs.existsSync(USERS_PATH)) {
            users = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
        } else {
            const hashedPassword = bcrypt.hashSync('admin123', 12);
            users = {
                professeurs: [
                    { id: 'prof1', username: 'admin', password: hashedPassword, nom: 'Administrateur', role: 'admin', createdAt: new Date().toISOString() }
                ]
            };
            fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), 'utf8');
        }
    } catch (error) {
        logger.error('Erreur chargement utilisateurs');
    }
}

function sauvegarderUsers() {
    fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), 'utf8');
}

chargerConfig();
chargerUsers();
chargerSessions();
chargerCacheBases();

// ==================== MIDDLEWARE AUTH ====================
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Token requis' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token invalide' });
    }
}

// Sanitiser un segment de chemin : retirer tout caractère non alphanumérique sauf espace, tiret, underscore
function sanitiserSegment(str) {
    return String(str || '').replace(/[^a-zA-Z0-9 \-_\u00C0-\u024F]/g, '').trim().substring(0, 64);
}

// ==================== VALIDATION ====================
const validateExamStart = [
    body('nom').trim().notEmpty().withMessage('Nom requis')
        .matches(/^[a-zA-Z\u00C0-\u024F\s\-']+$/).withMessage('Nom invalide'),
    body('prenom').trim().notEmpty().withMessage('Prénom requis')
        .matches(/^[a-zA-Z\u00C0-\u024F\s\-']+$/).withMessage('Prénom invalide'),
    body('groupe').trim().notEmpty().withMessage('Groupe requis')
        .matches(/^[a-zA-Z0-9\s\-_]+$/).withMessage('Groupe invalide'),
    body('site').trim().notEmpty().withMessage('Site requis')
        .custom(val => {
            if (!SITES.includes(val)) throw new Error('Site invalide');
            return true;
        }),
    body('matiere').trim().notEmpty().withMessage('Matière requise')
        .custom(val => {
            if (!questionsCache) chargerCacheBases();
            if (!questionsCache.matieres.has(val.toLowerCase())) throw new Error('Matière invalide');
            return true;
        })
];

const validateLogin = [
    body('username').trim().notEmpty().escape(),
    body('password').notEmpty()
];

function handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
}

// ==================== FONCTIONS UTILITAIRES ====================
function chargerQuestions(matiere) {
    const questions = { qcm: [], redaction: [], graphQcm: [] };
    try {
        if (!questionsCache) chargerCacheBases();
        const matiereSearch = matiere.toLowerCase().replace(/_/g, ' ');
        questionsCache.questions.forEach((data, fichier) => {
            const matiereNorm = (data.matiere || '').toLowerCase();
            if (matiereNorm.includes(matiereSearch) || matiereSearch.includes(matiereNorm) || fichier.toLowerCase().includes(matiere.toLowerCase())) {
                // Normaliser le type (insensible à la casse, variantes et accents acceptés)
                const typeRaw = (data.type || '').toLowerCase();
                const isQcm      = typeRaw === 'qcm';
                const isRedaction = typeRaw.startsWith('red') || typeRaw.includes('daction');
                const isGraphQcm  = typeRaw.includes('graph') || typeRaw === 'graph_qcm';
                if (isQcm) questions.qcm.push(...(data.questions || []));
                else if (isRedaction) questions.redaction.push(...(data.questions || []));
                else if (isGraphQcm) questions.graphQcm.push(...(data.questions || []));
            }
        });
    } catch (error) {
        logger.error('Erreur chargement questions', { matiere, error: error.message });
    }
    return questions;
}

function melangerTableau(tableau) {
    const copie = [...tableau];
    for (let i = copie.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copie[i], copie[j]] = [copie[j], copie[i]];
    }
    return copie;
}

function genererExamen(matiere) {
    const questions = chargerQuestions(matiere);
    const exclusions = examConfig.questionsExclues?.[matiere] || { qcm: [], redaction: [], graphQcm: [] };
    
    const qcmDisponibles = questions.qcm.filter(q => !exclusions.qcm?.includes(q.id) && !q.exclue);
    const redactionDisponibles = questions.redaction.filter(q => !exclusions.redaction?.includes(q.id) && !q.exclue);
    const graphQcmDisponibles = questions.graphQcm.filter(q => !exclusions.graphQcm?.includes(q.id) && !q.exclue);
    
    return {
        qcm: melangerTableau(qcmDisponibles).slice(0, examConfig.nombreQCM),
        redaction: melangerTableau(redactionDisponibles).slice(0, examConfig.nombreRedaction),
        graphQcm: melangerTableau(graphQcmDisponibles).slice(0, examConfig.nombreGraphQcm)
    };
}

function creerDossierEtudiant(site, matiere, groupe, nom, prenom) {
    const nomSafe = sanitiserSegment(nom).replace(/\s+/g, '-').toUpperCase();
    const prenomSafe = sanitiserSegment(prenom).replace(/\s+/g, '-').toUpperCase();
    const groupeSafe = sanitiserSegment(groupe).replace(/\s+/g, '-');
    const siteSafe = sanitiserSegment(site).replace(/\s+/g, '-');
    const matiereSafe = sanitiserSegment(matiere);
    const dossierPath = path.resolve(EXAMENS_PATH, siteSafe, matiereSafe, groupeSafe, `${nomSafe}_${prenomSafe}`);
    // Protection path traversal : vérifier que le dossier reste sous EXAMENS_PATH
    if (!dossierPath.startsWith(path.resolve(EXAMENS_PATH) + path.sep)) {
        throw new Error('Chemin de dossier invalide');
    }
    if (!fs.existsSync(dossierPath)) {
        fs.mkdirSync(dossierPath, { recursive: true });
    }
    return dossierPath;
}

function calculerNote(examen, reponses) {
    let noteQcm = 0, noteGraphQcm = 0, noteRedaction = 0;
    let maxQcm = 0, maxGraphQcm = 0, maxRedaction = 0;
    const detailQCM = [], detailGraphQCM = [], questionsRedaction = [];
    
    // QCM
    examen.qcm.forEach((q, i) => {
        const points = q.points || 1;
        maxQcm += points;
        const reponseEtudiant = reponses.qcm?.[i];
        const correct = reponseEtudiant === q.reponse;
        if (correct) noteQcm += points;
        detailQCM.push({
            question: q.question,
            options: q.options,
            reponseEtudiant,
            reponseCorrecte: q.reponse,
            correct,
            points: correct ? points : 0,
            pointsMax: points
        });
    });
    
    // GraphQCM
    examen.graphQcm.forEach((q, i) => {
        const points = q.points || 2;
        maxGraphQcm += points;
        const rep = reponses.graphQcm?.[i];
        let score = 0;
        
        if (q.type === 'ordre' && rep && q.reponse_ordre) {
            const correct = JSON.stringify(rep) === JSON.stringify(q.reponse_ordre);
            score = correct ? points : 0;
        } else if (q.type === 'association' && rep && q.associations) {
            let bonnes = 0;
            q.associations.forEach(([g, d]) => {
                if (rep[g] === d) bonnes++;
            });
            score = Math.round((bonnes / q.associations.length) * points);
        } else if (q.type === 'classification' && rep && q.elements) {
            let bonnes = 0;
            q.elements.forEach((el, idx) => {
                if (rep[idx] === el.categorie) bonnes++;
            });
            score = Math.round((bonnes / q.elements.length) * points);
        }
        
        noteGraphQcm += score;
        detailGraphQCM.push({
            question: q.question,
            type: q.type,
            reponseEtudiant: rep,
            points: score,
            pointsMax: points
        });
    });
    
    // Rédaction
    examen.redaction.forEach((q, i) => {
        const points = q.points || 5;
        maxRedaction += points;
        const rep = reponses.redaction?.[i] || '';
        const motsCles = q.mots_cles || [];
        let motsPresents = 0;
        motsCles.forEach(mot => {
            if (rep.toLowerCase().includes(mot.toLowerCase())) motsPresents++;
        });
        const score = motsCles.length > 0 ? Math.round((motsPresents / motsCles.length) * points) : 0;
        noteRedaction += score;
        questionsRedaction.push({
            question: q.question,
            reponse: rep,
            points: score,
            pointsMax: points,
            mots_cles: motsCles,
            motsPresents
        });
    });
    
    const total = noteQcm + noteGraphQcm + noteRedaction;
    const totalMax = maxQcm + maxGraphQcm + maxRedaction;
    const noteSur20 = totalMax > 0 ? Math.round((total / totalMax) * 20 * 10) / 10 : 0;
    
    return {
        qcm: noteQcm, graphQcm: noteGraphQcm, redaction: noteRedaction,
        total, totalMax, pourcentage: totalMax > 0 ? Math.round((total / totalMax) * 100) : 0,
        noteSur20, detailQCM, detailGraphQCM, questionsRedaction
    };
}

// ==================== STATISTIQUES ====================
function getStatistiques() {
    const stats = {
        total: examensEnCours.size,
        enCours: 0,
        soumis: 0,
        parSite: {},
        parMatiere: {},
        parExamen: {},
        moyennes: { qcm: 0, graphQcm: 0, total: 0 },
        examensRecents: []
    };
    
    let sommeTotal = 0, nbSoumis = 0;
    
    // Examens depuis fichiers
    try {
        if (fs.existsSync(EXAMENS_PATH)) {
            const sites = fs.readdirSync(EXAMENS_PATH).filter(f => fs.statSync(path.join(EXAMENS_PATH, f)).isDirectory());
            sites.forEach(site => {
                const sitePath = path.join(EXAMENS_PATH, site);
                const matieres = fs.readdirSync(sitePath).filter(f => fs.statSync(path.join(sitePath, f)).isDirectory());
                matieres.forEach(matiere => {
                    const matierePath = path.join(sitePath, matiere);
                    const groupes = fs.readdirSync(matierePath).filter(f => fs.statSync(path.join(matierePath, f)).isDirectory());
                    groupes.forEach(groupe => {
                        const groupePath = path.join(matierePath, groupe);
                        const etudiants = fs.readdirSync(groupePath).filter(f => fs.statSync(path.join(groupePath, f)).isDirectory());
                        etudiants.forEach(etudiant => {
                            const resultatsFile = path.join(groupePath, etudiant, 'resultats.json');
                            if (fs.existsSync(resultatsFile)) {
                                try {
                                    const data = JSON.parse(fs.readFileSync(resultatsFile, 'utf8'));
                                    if (!stats.parSite[site]) stats.parSite[site] = { enCours: 0, termines: 0 };
                                    if (!stats.parMatiere[matiere]) stats.parMatiere[matiere] = { enCours: 0, termines: 0 };
                                    if (!stats.parExamen[matiere]) stats.parExamen[matiere] = { enCours: 0, termines: 0, moyenne: null, total: 0, somme: 0, nb: 0 };
                                    
                                    stats.parSite[site].termines++;
                                    stats.parMatiere[matiere].termines++;
                                    stats.parExamen[matiere].termines++;
                                    stats.parExamen[matiere].total++;
                                    stats.soumis++;
                                    stats.total++;
                                    
                                    if (data.note?.noteSur20) {
                                        stats.parExamen[matiere].somme += data.note.noteSur20;
                                        stats.parExamen[matiere].nb++;
                                        sommeTotal += data.note.noteSur20;
                                        nbSoumis++;
                                    }
                                } catch (e) {}
                            }
                        });
                    });
                });
            });
        }
    } catch (e) {}
    
    // Examens en cours
    examensEnCours.forEach((exam, id) => {
        const site = exam.site || 'Inconnu';
        const matiere = exam.matiere || 'Inconnu';
        
        if (!stats.parSite[site]) stats.parSite[site] = { enCours: 0, termines: 0 };
        if (!stats.parMatiere[matiere]) stats.parMatiere[matiere] = { enCours: 0, termines: 0 };
        if (!stats.parExamen[matiere]) stats.parExamen[matiere] = { enCours: 0, termines: 0, moyenne: null, total: 0, somme: 0, nb: 0 };
        
        if (exam.soumis) {
            stats.soumis++;
            stats.parSite[site].termines++;
            stats.parMatiere[matiere].termines++;
            stats.parExamen[matiere].termines++;
            if (exam.note?.noteSur20) {
                stats.parExamen[matiere].somme += exam.note.noteSur20;
                stats.parExamen[matiere].nb++;
            }
        } else {
            stats.enCours++;
            stats.parSite[site].enCours++;
            stats.parMatiere[matiere].enCours++;
            stats.parExamen[matiere].enCours++;
        }
        stats.parExamen[matiere].total++;
    });
    
    // Calculer moyennes
    Object.keys(stats.parExamen).forEach(m => {
        const ex = stats.parExamen[m];
        if (ex.nb > 0) ex.moyenne = Math.round((ex.somme / ex.nb) * 10) / 10;
        delete ex.somme;
        delete ex.nb;
    });
    
    if (nbSoumis > 0) stats.moyennes.total = Math.round((sommeTotal / nbSoumis) * 10) / 10;
    
    // Récents
    stats.examensRecents = Array.from(examensEnCours.values())
        .sort((a, b) => new Date(b.heureDebut) - new Date(a.heureDebut))
        .slice(0, 10)
        .map(e => ({ nom: e.nom, prenom: e.prenom, groupe: e.groupe, site: e.site, matiere: e.matiere, soumis: e.soumis, note: e.note, heureDebut: e.heureDebut }));
    
    return stats;
}

// ==================== WEBSOCKET ====================
io.on('connection', (socket) => {
    logger.info('Client WebSocket connecté', { id: socket.id });
    
    socket.on('join-exam', (sessionId) => {
        socket.join(`exam-${sessionId}`);
    });
    
    socket.on('auto-save', (data) => {
        const { sessionId, reponses } = data;
        const exam = examensEnCours.get(sessionId);
        if (exam && !exam.soumis) {
            exam.reponsesTemp = reponses;
            exam.lastSave = new Date().toISOString();
            socket.emit('save-confirmed', { timestamp: exam.lastSave });
        }
    });
    
    socket.on('disconnect', () => {
        logger.info('Client WebSocket déconnecté', { id: socket.id });
    });
});

// Notifier les profs
function notifierProfs(event, data) {
    io.emit('prof-notification', { event, data, timestamp: new Date().toISOString() });
}

// ==================== API PUBLIQUE ====================
app.get('/api/config', (req, res) => {
    res.json({
        sites: SITES,
        examActif: examConfig.examActif,
        messageAccueil: examConfig.messageAccueil,
        dureeExamen: examConfig.dureeExamen
    });
});

app.get('/api/matieres', (req, res) => {
    try {
        if (!questionsCache) chargerCacheBases();
        res.json(Array.from(questionsCache.matieres.values()));
    } catch (error) {
        res.json([]);
    }
});

// ==================== API EXAMEN ====================
app.post('/api/examen/start', validateExamStart, handleValidationErrors, (req, res) => {
    const { nom, prenom, groupe, site, matiere } = req.body;
    
    if (!examConfig.examActif) {
        return res.status(403).json({ error: 'Les examens sont désactivés' });
    }
    
    // Vérifier reprise
    for (const [id, exam] of examensEnCours) {
        if (exam.nom === nom && exam.prenom === prenom && exam.matiere === matiere && !exam.soumis) {
            // Bloquer la reprise si le temps est expiré
            if (new Date() > new Date(exam.heureFin)) {
                logger.warn('Tentative de reprise après expiration du temps', { sessionId: id, nom, prenom });
                return res.status(403).json({ error: 'Le temps de votre examen est écoulé. La session a expiré.' });
            }
            logger.info('Reprise examen', { sessionId: id, nom, prenom });
            return res.json({
                sessionId: id,
                qcm: exam.examen.qcm.map(q => ({ id: q.id, question: q.question, options: q.options })),
                redaction: exam.examen.redaction,
                graphQcm: exam.examen.graphQcm,
                heureFin: exam.heureFin,
                duree: examConfig.dureeExamen,
                reprise: true,
                reponsesTemp: exam.reponsesTemp
            });
        }
    }
    
    const sessionId = uuidv4();
    const examen = genererExamen(matiere);
    const heureDebut = new Date();
    const dureeMode = req.body.mode === 'freestyle' ? 40 : examConfig.dureeExamen;
    const heureFin = new Date(heureDebut.getTime() + dureeMode * 60000);
    const dossier = creerDossierEtudiant(site, matiere, groupe, nom, prenom);
    
    examensEnCours.set(sessionId, {
        nom, prenom, groupe, site, matiere, examen,
        heureDebut: heureDebut.toISOString(),
        heureFin: heureFin.toISOString(),
        dossier, soumis: false, note: null, reponsesTemp: null
    });
    
    logAction('EXAM_START', `${prenom} ${nom}`, { sessionId, site, matiere, groupe });
    notifierProfs('exam-started', { sessionId, nom, prenom, site, matiere, groupe });
    
    res.json({
        sessionId,
        qcm: examen.qcm.map(q => ({ id: q.id, question: q.question, options: q.options })),
        redaction: examen.redaction,
        graphQcm: examen.graphQcm,
        heureFin: heureFin.toISOString(),
        duree: examConfig.dureeExamen
    });
});

app.post('/api/examen/submit', (req, res) => {
    const { sessionId, reponses } = req.body;
    const examData = examensEnCours.get(sessionId);
    
    if (!examData) return res.status(404).json({ error: 'Session non trouvée' });
    if (examData.soumis) return res.status(400).json({ error: 'Examen déjà soumis', note: examData.note });

    // Vérifier que le temps n'est pas expiré (tolérance de 60s pour le délai réseau)
    const maintenant = new Date();
    const heureFin = new Date(examData.heureFin);
    const GRACE_MS = 60 * 1000;
    if (maintenant > new Date(heureFin.getTime() + GRACE_MS)) {
        logger.warn('Soumission refusée — temps expiré', {
            nom: examData.nom, prenom: examData.prenom,
            retard: Math.round((maintenant - heureFin) / 1000) + 's'
        });
        return res.status(403).json({ error: 'Le temps de l\'examen est écoulé. La soumission a été refusée.' });
    }

    const note = calculerNote(examData.examen, reponses);
    examData.soumis = true;
    examData.note = note;
    examData.reponses = reponses;
    examData.heureSoumission = new Date().toISOString();
    
    // Sauvegarder
    const resultat = {
        etudiant: { nom: examData.nom, prenom: examData.prenom, groupe: examData.groupe, site: examData.site },
        matiere: examData.matiere,
        heureDebut: examData.heureDebut,
        heureSoumission: examData.heureSoumission,
        note, reponses,
        detailQCM: note.detailQCM,
        detailGraphQCM: note.detailGraphQCM,
        questionsRedaction: note.questionsRedaction,
        violations: examData.violations || []
    };
    
    fs.writeFileSync(path.join(examData.dossier, 'resultats.json'), JSON.stringify(resultat, null, 2), 'utf8');
    
    logAction('EXAM_SUBMIT', `${examData.prenom} ${examData.nom}`, { sessionId, note: note.noteSur20 });
    notifierProfs('exam-submitted', { sessionId, nom: examData.nom, prenom: examData.prenom, note: note.noteSur20 });
    
    res.json({ success: true, note });
});

app.post('/api/examen/anticheat', (req, res) => {
    const { sessionId, type } = req.body;
    const exam = examensEnCours.get(sessionId);
    if (!exam || exam.soumis) return res.status(400).json({ error: 'Session invalide' });

    if (!exam.violations) exam.violations = [];
    exam.violations.push({ type, timestamp: new Date().toISOString() });

    logger.warn('Violation anti-triche', {
        nom: exam.nom, prenom: exam.prenom,
        groupe: exam.groupe, site: exam.site,
        matiere: exam.matiere, type,
        totalViolations: exam.violations.length
    });

    res.json({ success: true, totalViolations: exam.violations.length });
});

app.post('/api/examen/autosave', (req, res) => {
    const { sessionId, reponses } = req.body;
    const exam = examensEnCours.get(sessionId);
    
    if (!exam || exam.soumis) return res.status(400).json({ error: 'Session invalide' });
    
    exam.reponsesTemp = reponses;
    exam.lastSave = new Date().toISOString();
    
    res.json({ success: true, timestamp: exam.lastSave });
});

// ==================== API AUTHENTIFICATION ====================
app.post('/api/auth/login', authLimiter, validateLogin, handleValidationErrors, async (req, res) => {
    const { username, password } = req.body;
    const user = users.professeurs.find(u => u.username === username);
    
    if (!user) {
        logger.warn('Tentative connexion échouée', { username });
        return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        logger.warn('Mot de passe incorrect', { username });
        return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    logAction('LOGIN', username, { ip: req.ip });
    
    res.json({ token, user: { id: user.id, username: user.username, nom: user.nom, role: user.role } });
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// ==================== API PROFESSEUR ====================
app.get('/api/professeur/stats', authMiddleware, (req, res) => {
    res.json(getStatistiques());
});

app.get('/api/professeur/examens', authMiddleware, (req, res) => {
    const examens = [];
    examensEnCours.forEach((exam, id) => {
        examens.push({ id, ...exam, examen: undefined });
    });
    res.json(examens.sort((a, b) => new Date(b.heureDebut) - new Date(a.heureDebut)));
});

app.get('/api/professeur/history', authMiddleware, (req, res) => {
    try {
        if (fs.existsSync(HISTORY_PATH)) {
            const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
            res.json(history.slice(-100).reverse());
        } else {
            res.json([]);
        }
    } catch (e) {
        res.json([]);
    }
});

// ==================== GESTION UTILISATEURS ====================
app.get('/api/professeur/users', authMiddleware, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    res.json(users.professeurs.map(u => ({ id: u.id, username: u.username, nom: u.nom, role: u.role, createdAt: u.createdAt })));
});

app.post('/api/professeur/users', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    const { username, password, nom, role } = req.body;
    if (!username || !password || !nom) return res.status(400).json({ error: 'Données manquantes' });
    
    if (users.professeurs.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Utilisateur existe déjà' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = {
        id: uuidv4(),
        username, password: hashedPassword, nom,
        role: role || 'prof',
        createdAt: new Date().toISOString()
    };
    
    users.professeurs.push(newUser);
    sauvegarderUsers();
    logAction('USER_CREATE', req.user.username, { newUser: username });
    
    res.json({ success: true, user: { id: newUser.id, username, nom, role: newUser.role } });
});

app.put('/api/professeur/users/:id', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    const { id } = req.params;
    const { nom, role, password } = req.body;
    
    const user = users.professeurs.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    
    if (nom) user.nom = nom;
    if (role) user.role = role;
    if (password) user.password = await bcrypt.hash(password, 12);
    
    sauvegarderUsers();
    logAction('USER_UPDATE', req.user.username, { userId: id });
    
    res.json({ success: true });
});

app.delete('/api/professeur/users/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    const { id } = req.params;
    if (id === req.user.id) return res.status(400).json({ error: 'Impossible de supprimer votre propre compte' });
    
    const index = users.professeurs.findIndex(u => u.id === id);
    if (index === -1) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    
    const deleted = users.professeurs.splice(index, 1)[0];
    sauvegarderUsers();
    logAction('USER_DELETE', req.user.username, { deletedUser: deleted.username });
    
    res.json({ success: true });
});

// ==================== EXPORT EXCEL ====================
app.get('/api/professeur/export/excel', authMiddleware, async (req, res) => {
    const { site, matiere } = req.query;
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Résultats');
    
    sheet.columns = [
        { header: 'Nom', key: 'nom', width: 20 },
        { header: 'Prénom', key: 'prenom', width: 20 },
        { header: 'Groupe', key: 'groupe', width: 15 },
        { header: 'Site', key: 'site', width: 15 },
        { header: 'Matière', key: 'matiere', width: 25 },
        { header: 'Note QCM', key: 'noteQcm', width: 12 },
        { header: 'Note Graph', key: 'noteGraph', width: 12 },
        { header: 'Note Rédac', key: 'noteRedac', width: 12 },
        { header: 'Total', key: 'total', width: 12 },
        { header: 'Note /20', key: 'noteSur20', width: 12 },
        { header: 'Date', key: 'date', width: 20 }
    ];
    
    // Style header
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00A651' } };
    
    // Collecter données
    try {
        if (fs.existsSync(EXAMENS_PATH)) {
            const sites = site ? [site] : fs.readdirSync(EXAMENS_PATH).filter(f => fs.statSync(path.join(EXAMENS_PATH, f)).isDirectory());
            sites.forEach(s => {
                const sitePath = path.join(EXAMENS_PATH, s);
                if (!fs.existsSync(sitePath)) return;
                const matieres = matiere ? [matiere] : fs.readdirSync(sitePath).filter(f => fs.statSync(path.join(sitePath, f)).isDirectory());
                matieres.forEach(m => {
                    const matierePath = path.join(sitePath, m);
                    if (!fs.existsSync(matierePath)) return;
                    const groupes = fs.readdirSync(matierePath).filter(f => fs.statSync(path.join(matierePath, f)).isDirectory());
                    groupes.forEach(g => {
                        const groupePath = path.join(matierePath, g);
                        const etudiants = fs.readdirSync(groupePath).filter(f => fs.statSync(path.join(groupePath, f)).isDirectory());
                        etudiants.forEach(e => {
                            const resultatsFile = path.join(groupePath, e, 'resultats.json');
                            if (fs.existsSync(resultatsFile)) {
                                try {
                                    const data = JSON.parse(fs.readFileSync(resultatsFile, 'utf8'));
                                    sheet.addRow({
                                        nom: data.etudiant?.nom || e.split('_')[0],
                                        prenom: data.etudiant?.prenom || e.split('_')[1],
                                        groupe: g,
                                        site: s,
                                        matiere: m,
                                        noteQcm: data.note?.qcm || 0,
                                        noteGraph: data.note?.graphQcm || 0,
                                        noteRedac: data.note?.redaction || 0,
                                        total: data.note?.total || 0,
                                        noteSur20: data.note?.noteSur20 || 0,
                                        date: data.heureSoumission ? new Date(data.heureSoumission).toLocaleString('fr-FR') : ''
                                    });
                                } catch (err) {}
                            }
                        });
                    });
                });
            });
        }
    } catch (e) {
        logger.error('Erreur export Excel', { error: e.message });
    }
    
    logAction('EXPORT_EXCEL', req.user.username, { site, matiere });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=resultats_${Date.now()}.xlsx`);
    
    await workbook.xlsx.write(res);
    res.end();
});

// ==================== EXPORT PDF ====================
app.get('/api/professeur/export/pdf/:chemin', authMiddleware, (req, res) => {
    const chemin = decodeURIComponent(req.params.chemin);
    const fullPath = path.resolve(EXAMENS_PATH, chemin, 'resultats.json');
    const examensResolved = path.resolve(EXAMENS_PATH) + path.sep;

    if (!fullPath.startsWith(examensResolved)) {
        logger.warn('Tentative path traversal bloquée', { chemin, ip: req.ip, user: req.user.username });
        return res.status(403).json({ error: 'Accès refusé' });
    }
    
    if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'Fichier non trouvé' });
    }
    
    try {
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        const doc = new PDFDocument({ margin: 50 });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=copie_${data.etudiant?.nom}_${data.etudiant?.prenom}.pdf`);
        
        doc.pipe(res);
        
        // En-tête
        doc.fontSize(20).text('EMSI - Copie d\'examen', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12);
        doc.text(`Étudiant: ${data.etudiant?.prenom} ${data.etudiant?.nom}`);
        doc.text(`Groupe: ${data.etudiant?.groupe} | Site: ${data.etudiant?.site}`);
        doc.text(`Matière: ${data.matiere}`);
        doc.text(`Date: ${data.heureSoumission ? new Date(data.heureSoumission).toLocaleString('fr-FR') : 'N/A'}`);
        doc.moveDown();
        
        // Note
        doc.fontSize(16).fillColor('green').text(`Note finale: ${data.note?.noteSur20 || 0}/20`, { align: 'center' });
        doc.fillColor('black').fontSize(10);
        doc.text(`QCM: ${data.note?.qcm || 0} | GraphQCM: ${data.note?.graphQcm || 0} | Rédaction: ${data.note?.redaction || 0}`);
        doc.moveDown();
        
        // QCM
        if (data.detailQCM?.length > 0) {
            doc.fontSize(14).text('Questions QCM', { underline: true });
            doc.fontSize(10);
            data.detailQCM.forEach((q, i) => {
                doc.moveDown(0.5);
                doc.text(`${i + 1}. ${q.question}`);
                doc.text(`   Réponse: ${q.options?.[q.reponseEtudiant] || 'Non répondu'} ${q.correct ? '✓' : '✗'}`);
            });
        }
        
        // Rédaction
        if (data.questionsRedaction?.length > 0) {
            doc.addPage();
            doc.fontSize(14).text('Questions Rédaction', { underline: true });
            doc.fontSize(10);
            data.questionsRedaction.forEach((q, i) => {
                doc.moveDown();
                doc.text(`${i + 1}. ${q.question} (${q.points}/${q.pointsMax} pts)`);
                doc.text(`Réponse: ${q.reponse || 'Non répondu'}`, { indent: 20 });
            });
        }
        
        doc.end();
        logAction('EXPORT_PDF', req.user.username, { chemin });
    } catch (error) {
        logger.error('Erreur génération PDF', { error: error.message });
        res.status(500).json({ error: 'Erreur génération PDF' });
    }
});

// ==================== PRÉVISUALISATION EXAMEN ====================
app.get('/api/professeur/preview/:matiere', authMiddleware, (req, res) => {
    const { matiere } = req.params;
    const examen = genererExamen(matiere);
    res.json({
        qcm: examen.qcm,
        redaction: examen.redaction,
        graphQcm: examen.graphQcm,
        duree: examConfig.dureeExamen
    });
});

// ==================== API BASES DE QUESTIONS ====================
app.get('/api/professeur/bases', authMiddleware, (req, res) => {
    try {
        const fichiers = fs.readdirSync(BASES_PATH).filter(f => f.endsWith('.json'));
        const bases = fichiers.map(fichier => {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(BASES_PATH, fichier), 'utf8'));
                // Déterminer le type depuis le nom du fichier ou le contenu
                let type = 'qcm';
                if (fichier.includes('redaction')) type = 'redaction';
                else if (fichier.includes('graph')) type = 'graph_qcm';
                
                // Normaliser le type du fichier JSON en minuscules
                const fileType = (data.type || type).toLowerCase().replace(' ', '_');
                const normalizedType = fileType === 'graphqcm' ? 'graph_qcm' : fileType;
                
                return {
                    fichier,
                    matiere: data.matiere || fichier.replace('.json', ''),
                    type: normalizedType,
                    count: (data.questions || []).length
                };
            } catch (e) { return null; }
        }).filter(Boolean);
        res.json(bases);
    } catch (error) {
        res.status(500).json({ error: 'Erreur chargement bases' });
    }
});

app.get('/api/professeur/bases/:fichier', authMiddleware, (req, res) => {
    const filePath = path.join(BASES_PATH, req.params.fichier);
    if (!filePath.startsWith(path.resolve(BASES_PATH))) return res.status(403).json({ error: 'Accès refusé' });
    try {
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch (error) {
        res.status(404).json({ error: 'Base non trouvée' });
    }
});

app.put('/api/professeur/bases/:fichier', authMiddleware, (req, res) => {
    const filePath = path.resolve(BASES_PATH, req.params.fichier);
    if (!filePath.startsWith(path.resolve(BASES_PATH) + path.sep)) return res.status(403).json({ error: 'Accès refusé' });
    try {
        // Sauvegarde avant écrasement
        if (fs.existsSync(filePath)) {
            const backupDir = path.join(BASES_PATH, 'sauvegardes');
            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            fs.copyFileSync(filePath, path.join(backupDir, `${req.params.fichier}.${timestamp}.backup`));
        }
        fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2), 'utf8');
        invaliderCacheBases();
        logAction('BASE_UPDATE', req.user.username, { fichier: req.params.fichier });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Erreur sauvegarde' });
    }
});

app.post('/api/professeur/bases', authMiddleware, (req, res) => {
    const { fichier, matiere, type, questions } = req.body;
    if (!fichier) return res.status(400).json({ error: 'Nom fichier requis' });
    if (!/^[\w\-]+\.json$/.test(fichier)) return res.status(400).json({ error: 'Nom de fichier invalide' });
    const filePath = path.resolve(BASES_PATH, fichier);
    if (!filePath.startsWith(path.resolve(BASES_PATH) + path.sep)) return res.status(403).json({ error: 'Accès refusé' });
    if (fs.existsSync(filePath)) return res.status(400).json({ error: 'Fichier existe déjà' });
    try {
        fs.writeFileSync(filePath, JSON.stringify({ matiere, type, questions: questions || [] }, null, 2), 'utf8');
        invaliderCacheBases();
        logAction('BASE_CREATE', req.user.username, { fichier });
        res.json({ success: true, fichier });
    } catch (error) {
        res.status(500).json({ error: 'Erreur création' });
    }
});

app.post('/api/professeur/bases/import', authMiddleware, (req, res) => {
    const { fichier, matiere, type, questions } = req.body;
    if (!fichier || !questions) return res.status(400).json({ error: 'Données manquantes' });
    const filePath = path.resolve(BASES_PATH, fichier);
    if (!filePath.startsWith(path.resolve(BASES_PATH) + path.sep)) return res.status(403).json({ error: 'Accès refusé' });
    try {
        fs.writeFileSync(filePath, JSON.stringify({ matiere, type, questions }, null, 2), 'utf8');
        invaliderCacheBases();
        logAction('BASE_IMPORT', req.user.username, { fichier, count: questions.length });
        res.json({ success: true, fichier, count: questions.length });
    } catch (error) {
        res.status(500).json({ error: 'Erreur import' });
    }
});

// ==================== API CORRECTIONS ====================
app.get('/api/professeur/corrections', authMiddleware, (req, res) => {
    const corrections = [];
    try {
        if (fs.existsSync(EXAMENS_PATH)) {
            const sites = fs.readdirSync(EXAMENS_PATH).filter(f => fs.statSync(path.join(EXAMENS_PATH, f)).isDirectory());
            sites.forEach(site => {
                const sitePath = path.join(EXAMENS_PATH, site);
                const matieres = fs.readdirSync(sitePath).filter(f => fs.statSync(path.join(sitePath, f)).isDirectory());
                matieres.forEach(matiere => {
                    const matierePath = path.join(sitePath, matiere);
                    const groupes = fs.readdirSync(matierePath).filter(f => fs.statSync(path.join(matierePath, f)).isDirectory());
                    groupes.forEach(groupe => {
                        const groupePath = path.join(matierePath, groupe);
                        const etudiants = fs.readdirSync(groupePath).filter(f => fs.statSync(path.join(groupePath, f)).isDirectory());
                        etudiants.forEach(etudiant => {
                            const resultatsFile = path.join(groupePath, etudiant, 'resultats.json');
                            if (fs.existsSync(resultatsFile)) {
                                try {
                                    const data = JSON.parse(fs.readFileSync(resultatsFile, 'utf8'));
                                    corrections.push({
                                        chemin: `${site}/${matiere}/${groupe}/${etudiant}`,
                                        site, matiere, groupe,
                                        nom: data.etudiant?.nom || etudiant.split('_')[0],
                                        prenom: data.etudiant?.prenom || etudiant.split('_')[1],
                                        note: data.note,
                                        heureSoumission: data.heureSoumission
                                    });
                                } catch (e) {}
                            }
                        });
                    });
                });
            });
        }
    } catch (e) {}
    res.json(corrections);
});

app.get('/api/professeur/corrections/:chemin', authMiddleware, (req, res) => {
    const chemin = decodeURIComponent(req.params.chemin);
    const fullPath = path.resolve(EXAMENS_PATH, chemin, 'resultats.json');
    if (!fullPath.startsWith(path.resolve(EXAMENS_PATH) + path.sep)) return res.status(403).json({ error: 'Accès refusé' });
    try {
        res.json(JSON.parse(fs.readFileSync(fullPath, 'utf8')));
    } catch (error) {
        res.status(404).json({ error: 'Copie non trouvée' });
    }
});

app.post('/api/professeur/corrections/save', authMiddleware, (req, res) => {
    const { chemin, resultats } = req.body;
    const fullPath = path.resolve(EXAMENS_PATH, chemin, 'resultats.json');
    if (!fullPath.startsWith(path.resolve(EXAMENS_PATH) + path.sep)) return res.status(403).json({ error: 'Accès refusé' });
    try {
        fs.writeFileSync(fullPath, JSON.stringify(resultats, null, 2), 'utf8');
        logAction('CORRECTION_SAVE', req.user.username, { chemin, note: resultats.note?.noteSur20 });
        res.json({ success: true, note: resultats.note });
    } catch (error) {
        res.status(500).json({ error: 'Erreur sauvegarde' });
    }
});

// ==================== STATISTIQUES PAR QUESTION ====================
app.get('/api/professeur/stats/questions', authMiddleware, (req, res) => {
    const { matiere } = req.query;
    const statsQCM = new Map(); // question_id -> { question, bonnes, total }

    try {
        if (fs.existsSync(EXAMENS_PATH)) {
            const sites = fs.readdirSync(EXAMENS_PATH).filter(f => fs.statSync(path.join(EXAMENS_PATH, f)).isDirectory());
            sites.forEach(site => {
                const matieres = fs.readdirSync(path.join(EXAMENS_PATH, site))
                    .filter(f => fs.statSync(path.join(EXAMENS_PATH, site, f)).isDirectory());
                matieres.forEach(mat => {
                    if (matiere && mat !== matiere) return;
                    const matPath = path.join(EXAMENS_PATH, site, mat);
                    const groupes = fs.readdirSync(matPath).filter(f => fs.statSync(path.join(matPath, f)).isDirectory());
                    groupes.forEach(groupe => {
                        const groupePath = path.join(matPath, groupe);
                        const etudiants = fs.readdirSync(groupePath).filter(f => fs.statSync(path.join(groupePath, f)).isDirectory());
                        etudiants.forEach(etudiant => {
                            const resultatsFile = path.join(groupePath, etudiant, 'resultats.json');
                            if (!fs.existsSync(resultatsFile)) return;
                            try {
                                const data = JSON.parse(fs.readFileSync(resultatsFile, 'utf8'));
                                (data.detailQCM || []).forEach((q, idx) => {
                                    const key = q.question || `q_${idx}`;
                                    if (!statsQCM.has(key)) {
                                        statsQCM.set(key, { question: q.question, bonnes: 0, total: 0, reponseCorrecte: q.reponseCorrecte });
                                    }
                                    const s = statsQCM.get(key);
                                    s.total++;
                                    if (q.correct) s.bonnes++;
                                });
                            } catch (e) {}
                        });
                    });
                });
            });
        }
    } catch (e) {
        logger.error('Erreur stats questions', { error: e.message });
    }

    const result = Array.from(statsQCM.values()).map(s => ({
        question: s.question,
        reponseCorrecte: s.reponseCorrecte,
        bonnes: s.bonnes,
        total: s.total,
        tauxReussite: s.total > 0 ? Math.round((s.bonnes / s.total) * 100) : 0
    })).sort((a, b) => a.tauxReussite - b.tauxReussite); // du plus difficile au plus facile

    res.json(result);
});

// ==================== API CONFIG ====================
app.get('/api/professeur/config', authMiddleware, (req, res) => {
    res.json(examConfig);
});

app.post('/api/professeur/config', authMiddleware, (req, res) => {
    examConfig = { ...examConfig, ...req.body };
    sauvegarderConfig();
    logAction('CONFIG_UPDATE', req.user.username, { changes: Object.keys(req.body) });
    res.json({ success: true, config: examConfig });
});

// ==================== API FREESTYLE ====================
app.post('/api/freestyle/autosave', (req, res) => {
    const { sessionId, rapport, filename } = req.body;
    const exam = examensEnCours.get(sessionId);
    if (!exam) return res.status(400).json({ error: 'Session invalide' });

    exam.rapportFreestyleTemp = rapport;
    exam.lastSave = new Date().toISOString();

    // Enregistrement immédiat dans le fichier JSON
    if (exam.dossier) {
        try {
            const sanitize = s => String(s || '').replace(/[^a-zA-Z0-9À-ɏ]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
            const safeFilename = filename
                ? path.basename(String(filename)).replace(/[^a-zA-Z0-9_\-\.]/g, '_')
                : `${sanitize(exam.nom)}_${sanitize(exam.prenom)}_${sanitize(exam.groupe)}_${sanitize(exam.site)}_${sanitize(exam.matiere)}.json`;
            const rapportData = { ...rapport, lastAutoSave: exam.lastSave };
            fs.writeFileSync(path.join(exam.dossier, safeFilename), JSON.stringify(rapportData, null, 2), 'utf8');
        } catch (e) {
            logger.warn('Erreur autosave freestyle', { error: e.message });
        }
    }

    res.json({ success: true, timestamp: exam.lastSave });
});

app.post('/api/freestyle/report', (req, res) => {
    const { sessionId, rapport, filename } = req.body;
    const exam = examensEnCours.get(sessionId);
    if (!exam) return res.status(404).json({ error: 'Session non trouvée' });
    if (exam.soumis) return res.status(400).json({ error: 'Rapport déjà soumis' });

    exam.soumis = true;
    exam.rapport = rapport;
    exam.heureSoumission = new Date().toISOString();

    // Nom du fichier : nom_prenom_groupe_site_matiere.json (fourni par le client et re-sanitisé)
    const sanitize = s => String(s || '').replace(/[^a-zA-Z0-9À-ɏ]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const safeFilename = filename
        ? path.basename(filename).replace(/[^a-zA-Z0-9_\-\.]/g, '_')
        : `${sanitize(exam.nom)}_${sanitize(exam.prenom)}_${sanitize(exam.groupe)}_${sanitize(exam.site)}_${sanitize(exam.matiere)}.json`;

    const rapportFinal = { ...rapport, heureSoumission: exam.heureSoumission, filename: safeFilename };
    fs.writeFileSync(path.join(exam.dossier, safeFilename), JSON.stringify(rapportFinal, null, 2), 'utf8');

    const nbVulns = (rapport.vulns || rapport.vulnerabilites || []).length;
    logAction('FREESTYLE_SUBMIT', `${exam.prenom} ${exam.nom}`, { sessionId, vulns: nbVulns, filename: safeFilename });
    notifierProfs('freestyle-submitted', { sessionId, nom: exam.nom, prenom: exam.prenom, vulns: nbVulns });

    res.json({ success: true, filename: safeFilename });
});

// ==================== DÉMARRAGE ====================
server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║     🎓 ENSAM Exam Platform V3 - Enhanced Edition         ║
╠══════════════════════════════════════════════════════════╣
║  🚀 Serveur démarré sur le port ${PORT}                    ║
║  📁 Bases: ${BASES_PATH.substring(0, 40)}...              ║
╠══════════════════════════════════════════════════════════╣
║  ✅ Rate limiting activé                                 ║
║  ✅ Validation des données                               ║
║  ✅ Persistance des sessions                             ║
║  ✅ WebSocket temps réel                                 ║
║  ✅ Logs structurés (Winston)                            ║
║  ✅ Export Excel/PDF                                     ║
║  ✅ Gestion utilisateurs                                 ║
║  ✅ Historique des actions                               ║
╠══════════════════════════════════════════════════════════╣
║  👨‍🎓 Étudiants:   http://localhost:${PORT}/                ║
║  👨‍🏫 Professeur:  http://localhost:${PORT}/professeur.html ║
╠══════════════════════════════════════════════════════════╣
╚══════════════════════════════════════════════════════════╝
    `);
    logger.info('Serveur V3 démarré', { port: PORT });
});

// Sauvegarde avant arrêt
process.on('SIGINT', () => {
    logger.info('Arrêt du serveur...');
    sauvegarderSessions();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Arrêt du serveur...');
    sauvegarderSessions();
    process.exit(0);
});
