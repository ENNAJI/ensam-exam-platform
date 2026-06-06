// Configuration
const API_URL = '';
let sessionId = null;
let timerInterval = null;
let reponsesQCM = [];
let reponsesRedaction = [];
let reponsesGraphQCM = [];
let examenData = null;
let totalQuestions = 0;
let dureeExamen = 50;
let modeEval = 'normal';

// Sélection du mode d'évaluation
function selectionnerMode(mode) {
    modeEval = mode;
    document.getElementById('mode-eval').value = mode;

    const btnNormal    = document.getElementById('btn-mode-normal');
    const btnRedteam   = document.getElementById('btn-mode-redteam');
    const btnFreestyle = document.getElementById('btn-mode-freestyle');
    const alerteRedteam   = document.getElementById('alerte-redteam');
    const alerteFreestyle = document.getElementById('alerte-freestyle');
    const btnStart = document.getElementById('btn-start');

    btnNormal.classList.remove('selected-mode');
    btnRedteam.classList.remove('selected-mode');
    btnFreestyle.classList.remove('selected-mode');
    alerteRedteam.classList.add('hidden');
    alerteFreestyle.classList.add('hidden');

    if (mode === 'normal') {
        btnNormal.classList.add('selected-mode');
        btnStart.innerHTML = '🚀 Commencer l\'Examen';
        btnStart.className = 'w-full py-4 bg-gradient-to-r from-ensam-500 to-ensam-600 text-white font-bold rounded-xl hover:from-ensam-600 hover:to-ensam-700 transition-all text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1';
    } else if (mode === 'redteam') {
        btnRedteam.classList.add('selected-mode');
        alerteRedteam.classList.remove('hidden');
        btnStart.innerHTML = '🔴 Lancer la Mission RedTeam';
        btnStart.className = 'w-full py-4 bg-gradient-to-r from-red-600 to-gray-900 text-white font-bold rounded-xl hover:from-red-700 hover:to-black transition-all text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1';
    } else if (mode === 'freestyle') {
        btnFreestyle.classList.add('selected-mode');
        alerteFreestyle.classList.remove('hidden');
        btnStart.innerHTML = '🕵️ Lancer l\'Intrusion Freestyle';
        btnStart.className = 'w-full py-4 bg-gradient-to-r from-orange-500 to-orange-700 text-white font-bold rounded-xl hover:from-orange-600 hover:to-orange-800 transition-all text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1';
    }
}

// Éléments DOM
const pageInscription = document.getElementById('page-inscription');
const pageExamen = document.getElementById('page-examen');
const pageResultats = document.getElementById('page-resultats');
const formInscription = document.getElementById('form-inscription');
const selectSite = document.getElementById('site');
const selectMatiere = document.getElementById('matiere');
const timerElement = document.getElementById('timer');
const progressBar = document.getElementById('progress-bar');
const questionsQCM = document.getElementById('questions-qcm');
const questionsRedaction = document.getElementById('questions-redaction');
const questionsGraphQCM = document.getElementById('questions-graphqcm');
const btnSoumettre = document.getElementById('btn-soumettre');
const loadingScreen = document.getElementById('loading-screen');

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
    const ok = await chargerConfig();

    if (!ok) {
        // Afficher une page d'erreur si le serveur est inaccessible
        loadingScreen.innerHTML = `
            <div class="text-center max-w-md mx-auto px-6">
                <div class="text-6xl mb-4">⚠️</div>
                <h2 class="text-2xl font-bold text-white mb-2">Serveur inaccessible</h2>
                <p class="text-white/80 mb-6">Impossible de contacter le serveur de la plateforme d'examen. Vérifiez votre connexion réseau.</p>
                <button onclick="location.reload()"
                    class="px-6 py-3 bg-white text-ensam-700 font-bold rounded-xl hover:bg-gray-100 transition">
                    🔄 Réessayer
                </button>
            </div>`;
        return;
    }

    // Masquer le loading et afficher la page
    setTimeout(() => {
        loadingScreen.classList.add('hidden');
        pageInscription.classList.remove('hidden');
    }, 500);

    formInscription.addEventListener('submit', demarrerExamen);
    btnSoumettre.addEventListener('click', ouvrirModalConfirmation);
});

// Charger la configuration — retourne true si succès, false si erreur
async function chargerConfig() {
    try {
        const response = await fetch(`${API_URL}/api/config`);
        if (!response.ok) return false;
        const config = await response.json();
        
        // Vérifier si les examens sont actifs
        if (!config.examActif) {
            document.getElementById('btn-start').disabled = true;
            document.getElementById('btn-start').textContent = '🔒 Examens non disponibles';
            document.getElementById('btn-start').classList.add('opacity-50', 'cursor-not-allowed');
        }
        
        // Message d'accueil
        if (config.messageAccueil) {
            document.getElementById('message-accueil').textContent = config.messageAccueil;
        }
        
        // Durée
        dureeExamen = config.dureeExamen || 50;
        document.getElementById('duree-info').textContent = `${dureeExamen} minutes`;
        
        // Remplir les sites
        config.sites.forEach(site => {
            const option = document.createElement('option');
            option.value = site;
            option.textContent = site;
            selectSite.appendChild(option);
        });
        
        // Remplir les matières depuis l'endpoint dédié
        const matiereResponse = await fetch(`${API_URL}/api/matieres`);
        const matieres = await matiereResponse.json();
        matieres.forEach(matiere => {
            const option = document.createElement('option');
            option.value = matiere.id;
            option.textContent = matiere.nom;
            selectMatiere.appendChild(option);
        });
        return true;
    } catch (error) {
        console.error('Erreur lors du chargement de la configuration:', error);
        return false;
    }
}

// Échappement HTML pour prévenir les injections XSS
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str ?? '');
    return div.innerHTML;
}

// Notification toast
function showNotification(message, type = 'info') {
    const colors = {
        info: 'bg-blue-500',
        success: 'bg-ensam-500',
        error: 'bg-red-500',
        warning: 'bg-amber-500'
    };
    
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-xl shadow-lg z-50 animate__animated animate__fadeInRight`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.remove('animate__fadeInRight');
        toast.classList.add('animate__fadeOutRight');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

// Démarrer l'examen
async function demarrerExamen(event) {
    event.preventDefault();
    
    const nom = document.getElementById('nom').value.trim();
    const prenom = document.getElementById('prenom').value.trim();
    const groupe = document.getElementById('groupe').value.trim();
    const site = selectSite.value;
    const matiere = selectMatiere.value;
    
    if (!nom || !prenom || !groupe || !site || !matiere) {
        showNotification('Veuillez remplir tous les champs', 'warning');
        return;
    }
    
    // Afficher loading
    const btn = document.getElementById('btn-start');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner inline-block w-5 h-5 mr-2"></span> Chargement...';
    btn.disabled = true;
    
    try {
        const response = await fetch(`${API_URL}/api/examen/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nom, prenom, groupe, site, matiere, mode: modeEval })
        });
        
        const data = await response.json();
        
        if (data.error) {
            showNotification(data.error, 'error');
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }
        
        if (data.reprise) {
            showNotification('Reprise de votre examen en cours...', 'info');
        }
        
        sessionId = data.sessionId;
        examenData = data;

        // Mode RedTeam → redirection vers la page de mission
        if (modeEval === 'redteam') {
            window.location.href = `/redteam.html?sessionId=${sessionId}&nom=${encodeURIComponent(nom)}&prenom=${encodeURIComponent(prenom)}&matiere=${encodeURIComponent(selectMatiere.options[selectMatiere.selectedIndex].text)}`;
            return;
        }

        // Mode Freestyle → redirection vers la page de rapport d'intrusion
        if (modeEval === 'freestyle') {
            const matiereLabel = selectMatiere.options[selectMatiere.selectedIndex].text;
            window.location.href = `/freestyle-report.html?sessionId=${sessionId}&nom=${encodeURIComponent(nom)}&prenom=${encodeURIComponent(prenom)}&groupe=${encodeURIComponent(groupe)}&site=${encodeURIComponent(site)}&matiere=${encodeURIComponent(matiereLabel)}&heureFin=${encodeURIComponent(data.heureFin)}`;
            return;
        }

        // Initialiser les tableaux de réponses
        reponsesQCM = new Array(data.qcm.length).fill(null);
        reponsesRedaction = new Array(data.redaction.length).fill('');
        reponsesGraphQCM = new Array((data.graphQcm || []).length).fill(null);
        
        totalQuestions = data.qcm.length + (data.graphQcm || []).length + data.redaction.length;
        
        // Afficher les informations
        document.getElementById('titre-matiere').textContent = selectMatiere.options[selectMatiere.selectedIndex].text;
        document.getElementById('info-etudiant').textContent = `${prenom} ${nom} - ${groupe} - ${site}`;
        document.getElementById('questions-total-header').textContent = `${totalQuestions} questions`;
        
        // Afficher les questions
        afficherQuestionsQCM(data.qcm);
        afficherQuestionsGraphQCM(data.graphQcm || []);
        afficherQuestionsRedaction(data.redaction);
        
        // Démarrer le timer
        demarrerTimer(data.heureFin);

        // Activer la surveillance anti-triche
        activerAntiTriche();
        
        // Changer de page avec animation
        pageInscription.classList.add('animate__animated', 'animate__fadeOut');
        setTimeout(() => {
            pageInscription.classList.add('hidden');
            pageInscription.classList.remove('animate__animated', 'animate__fadeOut');
            pageExamen.classList.remove('hidden');
            pageExamen.classList.add('animate__animated', 'animate__fadeIn');
            window.scrollTo(0, 0);
        }, 300);
        
    } catch (error) {
        console.error('Erreur:', error);
        showNotification('Erreur lors du démarrage de l\'examen', 'error');
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Afficher les questions QCM
function afficherQuestionsQCM(questions) {
    questionsQCM.innerHTML = '';
    
    questions.forEach((question, index) => {
        const card = document.createElement('div');
        card.className = 'question-card bg-white rounded-2xl p-6 shadow-md border border-gray-100';
        card.id = `qcm-${index}`;
        card.innerHTML = `
            <div class="flex items-start gap-4 mb-4">
                <div class="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-ensam-400 to-ensam-600 rounded-xl flex items-center justify-center text-white font-bold shadow">
                    ${index + 1}
                </div>
                <p class="text-gray-800 font-medium flex-1 pt-2">${escapeHtml(question.question)}</p>
            </div>
            <div class="space-y-3 ml-14">
                ${question.options.map((option, optIndex) => `
                    <button type="button"
                        class="option-btn w-full text-left px-5 py-4 rounded-xl border-2 border-gray-200 hover:border-ensam-300 flex items-center gap-3 group"
                        data-question="${index}" data-option="${optIndex}">
                        <span class="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-ensam-100 flex items-center justify-center font-bold text-gray-600 group-hover:text-ensam-600 transition">
                            ${String.fromCharCode(65 + optIndex)}
                        </span>
                        <span class="flex-1">${escapeHtml(option)}</span>
                    </button>
                `).join('')}
                <label class="flex items-center gap-3 mt-4 p-3 rounded-xl bg-amber-50 hover:bg-amber-100 cursor-pointer transition border border-amber-200">
                    <input type="checkbox" class="checkbox-custom je-ne-sais-pas-qcm" data-question="${index}">
                    <span class="text-amber-700 font-medium">❓ Je ne sais pas</span>
                </label>
            </div>
        `;
        questionsQCM.appendChild(card);
    });
    
    // Événements
    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.addEventListener('click', selectionnerOption);
    });
    
    document.querySelectorAll('.je-ne-sais-pas-qcm').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const questionIndex = parseInt(e.target.dataset.question);
            const card = document.getElementById(`qcm-${questionIndex}`);
            
            if (e.target.checked) {
                document.querySelectorAll(`[data-question="${questionIndex}"].option-btn`).forEach(b => {
                    b.classList.remove('selected');
                });
                reponsesQCM[questionIndex] = -1;
                card.classList.remove('answered');
                card.classList.add('skipped');
            } else {
                delete reponsesQCM[questionIndex];
                card.classList.remove('skipped');
            }
            mettreAJourCompteur();
        });
    });
}

// Sélectionner une option QCM
function selectionnerOption(event) {
    const btn = event.currentTarget;
    const questionIndex = parseInt(btn.dataset.question);
    const optionIndex = parseInt(btn.dataset.option);
    const card = document.getElementById(`qcm-${questionIndex}`);
    
    // Désélectionner les autres
    document.querySelectorAll(`[data-question="${questionIndex}"].option-btn`).forEach(b => {
        b.classList.remove('selected');
    });
    
    // Décocher "Je ne sais pas"
    const checkbox = document.querySelector(`.je-ne-sais-pas-qcm[data-question="${questionIndex}"]`);
    if (checkbox) checkbox.checked = false;
    
    // Sélectionner
    btn.classList.add('selected');
    reponsesQCM[questionIndex] = optionIndex;
    
    // Marquer comme répondu
    card.classList.remove('skipped');
    card.classList.add('answered');
    
    mettreAJourCompteur();
}

// Afficher les questions de rédaction
function afficherQuestionsRedaction(questions) {
    questionsRedaction.innerHTML = '';
    
    questions.forEach((question, index) => {
        const card = document.createElement('div');
        card.className = 'question-card bg-white rounded-2xl p-6 shadow-md border border-gray-100';
        card.id = `redaction-${index}`;
        card.innerHTML = `
            <div class="flex items-start gap-4 mb-4">
                <div class="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-purple-400 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold shadow">
                    R${index + 1}
                </div>
                <div class="flex-1">
                    <p class="text-gray-800 font-medium">${escapeHtml(question.question)}</p>
                    <span class="inline-block mt-2 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">${escapeHtml(question.points)} points</span>
                </div>
            </div>
            <div class="ml-14">
                <textarea 
                    class="w-full h-44 px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none transition textarea-redaction"
                    placeholder="Rédigez votre réponse ici..."
                    data-redaction="${index}"></textarea>
                <div class="flex items-center justify-between mt-3">
                    <label class="flex items-center gap-3 p-3 rounded-xl bg-amber-50 hover:bg-amber-100 cursor-pointer transition border border-amber-200">
                        <input type="checkbox" class="checkbox-custom je-ne-sais-pas-redaction" data-redaction-check="${index}">
                        <span class="text-amber-700 font-medium">❓ Je ne sais pas</span>
                    </label>
                    <span class="text-sm text-gray-400 char-count" data-count="${index}">0 caractères</span>
                </div>
            </div>
        `;
        questionsRedaction.appendChild(card);
    });
    
    // Événements textarea
    document.querySelectorAll('textarea[data-redaction]').forEach(textarea => {
        textarea.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.redaction);
            const card = document.getElementById(`redaction-${index}`);
            reponsesRedaction[index] = e.target.value;
            
            // Compteur de caractères
            document.querySelector(`[data-count="${index}"]`).textContent = `${e.target.value.length} caractères`;
            
            // Décocher si on tape
            if (e.target.value.trim()) {
                const checkbox = document.querySelector(`.je-ne-sais-pas-redaction[data-redaction-check="${index}"]`);
                if (checkbox) checkbox.checked = false;
                card.classList.remove('skipped');
                card.classList.add('answered');
            }
            mettreAJourCompteur();
        });
    });
    
    // Bloquer le copier-coller dans les rédactions
    document.querySelectorAll('textarea[data-redaction]').forEach(textarea => {
        textarea.addEventListener('paste', (e) => {
            e.preventDefault();
            showNotification('Le copier-coller est interdit dans les questions de rédaction.', 'error');
            if (sessionId) {
                fetch(`${API_URL}/api/examen/anticheat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, type: 'paste_redaction' })
                }).catch(() => {});
            }
        });
        textarea.addEventListener('copy', (e) => { e.preventDefault(); });
        textarea.addEventListener('cut', (e) => { e.preventDefault(); });
    });

    // Événements checkbox
    document.querySelectorAll('.je-ne-sais-pas-redaction').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.redactionCheck);
            const textarea = document.querySelector(`textarea[data-redaction="${index}"]`);
            const card = document.getElementById(`redaction-${index}`);
            
            if (e.target.checked) {
                if (textarea) {
                    textarea.value = '';
                    textarea.placeholder = 'Vous avez indiqué ne pas savoir...';
                    textarea.classList.add('bg-gray-100');
                }
                reponsesRedaction[index] = '__JE_NE_SAIS_PAS__';
                card.classList.remove('answered');
                card.classList.add('skipped');
            } else {
                if (textarea) {
                    textarea.placeholder = 'Rédigez votre réponse ici...';
                    textarea.classList.remove('bg-gray-100');
                }
                reponsesRedaction[index] = '';
                card.classList.remove('skipped');
            }
            mettreAJourCompteur();
        });
    });
}

// Afficher les questions GraphQCM
function afficherQuestionsGraphQCM(questions) {
    if (!questionsGraphQCM || questions.length === 0) {
        document.getElementById('section-graphqcm').style.display = 'none';
        return;
    }
    
    questionsGraphQCM.innerHTML = '';
    
    questions.forEach((question, index) => {
        const card = document.createElement('div');
        card.className = 'question-card bg-white rounded-2xl p-6 shadow-md border border-gray-100';
        card.id = `graph-${index}`;
        card.dataset.graphIndex = index;
        
        let contenu = `
            <div class="flex items-start gap-4 mb-4">
                <div class="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-teal-400 to-teal-600 rounded-xl flex items-center justify-center text-white font-bold shadow">
                    G${index + 1}
                </div>
                <div class="flex-1">
                    <p class="text-gray-800 font-medium">${escapeHtml(question.question)}</p>
                    <span class="inline-block mt-2 px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-sm font-medium">${escapeHtml(question.points)} points</span>
                </div>
            </div>
        `;
        
        if (question.type === 'ordre') {
            contenu += creerQuestionOrdre(question, index);
        } else if (question.type === 'classification') {
            contenu += creerQuestionClassification(question, index);
        } else if (question.type === 'association') {
            contenu += creerQuestionAssociation(question, index);
        }
        
        // Checkbox Je ne sais pas
        contenu += `
            <div class="ml-14 mt-4">
                <label class="flex items-center gap-3 p-3 rounded-xl bg-amber-50 hover:bg-amber-100 cursor-pointer transition border border-amber-200">
                    <input type="checkbox" class="checkbox-custom je-ne-sais-pas-graph" data-graph-check="${index}">
                    <span class="text-amber-700 font-medium">❓ Je ne sais pas</span>
                </label>
            </div>
        `;
        
        card.innerHTML = contenu;
        questionsGraphQCM.appendChild(card);
    });
    
    // Initialiser drag & drop
    initDragDropOrdre();
    initDragDropClassification();
    initDragDropAssociation();
    
    // Événements checkbox
    document.querySelectorAll('.je-ne-sais-pas-graph').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.graphCheck);
            const card = document.getElementById(`graph-${index}`);
            
            if (e.target.checked) {
                card.classList.add('opacity-60');
                card.querySelectorAll('.drag-item').forEach(item => {
                    item.setAttribute('draggable', 'false');
                    item.classList.add('cursor-not-allowed');
                });
                reponsesGraphQCM[index] = { type: 'je_ne_sais_pas', reponse: null };
                card.classList.remove('answered');
                card.classList.add('skipped');
            } else {
                card.classList.remove('opacity-60');
                card.querySelectorAll('.drag-item').forEach(item => {
                    item.setAttribute('draggable', 'true');
                    item.classList.remove('cursor-not-allowed');
                });
                delete reponsesGraphQCM[index];
                card.classList.remove('skipped');
            }
            mettreAJourCompteur();
        });
    });
}

// Créer question ordre
function creerQuestionOrdre(question, index) {
    const shuffled = [...question.elements].sort(() => Math.random() - 0.5);
    return `
        <div class="ml-14">
            <p class="text-sm text-gray-600 mb-3 flex items-center gap-2">
                <span class="text-lg">📌</span> Glissez les éléments pour les remettre dans le bon ordre
            </p>
            <div class="sortable-list space-y-2" data-type="ordre" data-index="${index}">
                ${shuffled.map(elem => `
                    <div class="drag-item bg-gradient-to-r from-gray-50 to-white border-2 border-gray-200 rounded-xl px-4 py-3 flex items-center shadow-sm hover:shadow-md transition" draggable="true" data-value="${escapeHtml(elem)}">
                        <span class="text-gray-400 mr-3 text-lg">☰</span>
                        <span class="flex-1">${escapeHtml(elem)}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Créer question classification
function creerQuestionClassification(question, index) {
    const shuffled = [...question.elements].sort(() => Math.random() - 0.5);
    return `
        <div class="ml-14">
            <p class="text-sm text-gray-600 mb-3 flex items-center gap-2">
                <span class="text-lg">🗂️</span> Glissez chaque élément dans la bonne catégorie
            </p>
            <div class="grid grid-cols-1 md:grid-cols-${question.categories.length} gap-4 mb-4">
                ${question.categories.map((cat, i) => `
                    <div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border-2 border-gray-200">
                        <h4 class="font-bold text-gray-700 mb-3 text-center">${escapeHtml(cat)}</h4>
                        <div class="drop-zone classification-zone min-h-[120px] p-2" data-type="classification" data-index="${index}" data-category="${i}">
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="bg-gray-100 rounded-xl p-4">
                <div class="text-sm text-gray-600 mb-2 font-medium">Éléments à classer :</div>
                <div class="source-zone flex flex-wrap gap-2" data-type="classification-source" data-index="${index}">
                    ${shuffled.map(elem => `
                        <div class="drag-item bg-white border-2 border-gray-300 rounded-lg px-4 py-2 cursor-grab shadow-sm hover:shadow-md transition" draggable="true" data-value="${escapeHtml(elem.nom)}">
                            ${escapeHtml(elem.nom)}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

// Créer question association
function creerQuestionAssociation(question, index) {
    const shuffledDroite = [...question.elements_droite].sort(() => Math.random() - 0.5);
    return `
        <div class="ml-14">
            <p class="text-sm text-gray-600 mb-3 flex items-center gap-2">
                <span class="text-lg">🔗</span> Associez chaque élément de gauche avec celui de droite
            </p>
            <div class="space-y-3 mb-4">
                ${question.elements_gauche.map((elem, i) => `
                    <div class="flex items-center gap-3">
                        <div class="bg-ensam-100 text-ensam-800 rounded-xl px-4 py-3 font-medium flex-1 max-w-[200px]">${escapeHtml(elem)}</div>
                        <div class="text-gray-400 text-xl">→</div>
                        <div class="drop-zone association-zone border-2 border-dashed border-gray-300 rounded-xl px-4 py-3 flex-1 min-h-[48px]" 
                            data-type="association" data-index="${index}" data-gauche="${i}">
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="bg-gray-100 rounded-xl p-4">
                <div class="text-sm text-gray-600 mb-2 font-medium">Éléments à associer :</div>
                <div class="source-zone flex flex-wrap gap-2" data-type="association-source" data-index="${index}">
                    ${shuffledDroite.map(elem => `
                        <div class="drag-item bg-white border-2 border-gray-300 rounded-lg px-4 py-2 cursor-grab shadow-sm hover:shadow-md transition" draggable="true" data-value="${escapeHtml(elem)}">
                            ${escapeHtml(elem)}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

// Drag & Drop - Ordre
function initDragDropOrdre() {
    document.querySelectorAll('.sortable-list[data-type="ordre"]').forEach(list => {
        const items = list.querySelectorAll('.drag-item');
        let draggedItem = null;
        
        items.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                draggedItem = item;
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                draggedItem = null;
                updateOrdreReponse(list);
            });
            
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                const afterElement = getDragAfterElement(list, e.clientY);
                if (afterElement == null) {
                    list.appendChild(draggedItem);
                } else {
                    list.insertBefore(draggedItem, afterElement);
                }
            });
        });
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.drag-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateOrdreReponse(list) {
    const index = parseInt(list.dataset.index);
    const items = list.querySelectorAll('.drag-item');
    const ordre = Array.from(items).map(item => item.dataset.value);
    const card = document.getElementById(`graph-${index}`);
    
    reponsesGraphQCM[index] = ordre;
    card.classList.add('answered');
    card.classList.remove('skipped');
    
    // Décocher je ne sais pas
    const checkbox = document.querySelector(`.je-ne-sais-pas-graph[data-graph-check="${index}"]`);
    if (checkbox) checkbox.checked = false;
    
    mettreAJourCompteur();
}

// Drag & Drop - Classification
function initDragDropClassification() {
    document.querySelectorAll('.source-zone[data-type="classification-source"]').forEach(source => {
        const index = parseInt(source.dataset.index);
        const dropZones = document.querySelectorAll(`.classification-zone[data-index="${index}"]`);
        setupClassificationDragDrop(source, dropZones, index);
    });
}

function setupClassificationDragDrop(source, dropZones, questionIndex) {
    function initDragEvents(item) {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', item.dataset.value);
            e.dataTransfer.effectAllowed = 'move';
            item.classList.add('dragging');
            setTimeout(() => item.style.opacity = '0.5', 0);
        });
        
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            item.style.opacity = '1';
            updateGraphQCMReponse(questionIndex, 'classification');
        });
    }
    
    source.querySelectorAll('.drag-item').forEach(initDragEvents);
    
    function setupDropZone(zone, isSource = false) {
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            zone.classList.add('drag-over');
        });
        
        zone.addEventListener('dragleave', (e) => {
            if (!zone.contains(e.relatedTarget)) {
                zone.classList.remove('drag-over');
            }
        });
        
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            
            const value = e.dataTransfer.getData('text/plain');
            const draggedItem = document.querySelector(`.drag-item.dragging[data-value="${CSS.escape(value)}"]`);
            
            if (draggedItem && !zone.contains(draggedItem)) {
                zone.appendChild(draggedItem);
                updateGraphQCMReponse(questionIndex, 'classification');
            }
        });
    }
    
    dropZones.forEach(zone => setupDropZone(zone, false));
    setupDropZone(source, true);
}

// Drag & Drop - Association
function initDragDropAssociation() {
    document.querySelectorAll('.source-zone[data-type="association-source"]').forEach(source => {
        const index = parseInt(source.dataset.index);
        const dropZones = document.querySelectorAll(`.association-zone[data-index="${index}"]`);
        setupAssociationDragDrop(source, dropZones, index);
    });
}

function setupAssociationDragDrop(source, dropZones, questionIndex) {
    function initDragEvents(item) {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', item.dataset.value);
            e.dataTransfer.effectAllowed = 'move';
            item.classList.add('dragging');
        });
        
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            updateGraphQCMReponse(questionIndex, 'association');
        });
    }
    
    source.querySelectorAll('.drag-item').forEach(initDragEvents);
    
    function setupDropZone(zone, isSource = false) {
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
        
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });
        
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            
            const value = e.dataTransfer.getData('text/plain');
            const draggedItem = document.querySelector(`.drag-item.dragging[data-value="${CSS.escape(value)}"]`);
            
            if (draggedItem) {
                // Si la zone a déjà un élément, le renvoyer à la source
                if (!isSource && zone.querySelector('.drag-item')) {
                    const existing = zone.querySelector('.drag-item');
                    source.appendChild(existing);
                }
                zone.appendChild(draggedItem);
                updateGraphQCMReponse(questionIndex, 'association');
            }
        });
    }
    
    dropZones.forEach(zone => setupDropZone(zone, false));
    setupDropZone(source, true);
}

function updateGraphQCMReponse(index, type) {
    const card = document.getElementById(`graph-${index}`);
    
    if (type === 'classification') {
        const classifications = {};
        document.querySelectorAll(`.classification-zone[data-index="${index}"]`).forEach(zone => {
            const category = parseInt(zone.dataset.category);
            zone.querySelectorAll('.drag-item').forEach(item => {
                classifications[item.dataset.value] = category;
            });
        });
        reponsesGraphQCM[index] = { classifications };
    } else if (type === 'association') {
        const associations = {};
        document.querySelectorAll(`.association-zone[data-index="${index}"]`).forEach(zone => {
            const gauche = parseInt(zone.dataset.gauche);
            const item = zone.querySelector('.drag-item');
            if (item) {
                associations[gauche] = item.dataset.value;
            }
        });
        reponsesGraphQCM[index] = { associations };
    }
    
    card.classList.add('answered');
    card.classList.remove('skipped');
    
    // Décocher je ne sais pas
    const checkbox = document.querySelector(`.je-ne-sais-pas-graph[data-graph-check="${index}"]`);
    if (checkbox) checkbox.checked = false;
    
    mettreAJourCompteur();
}

// Anti-triche
let violationsCount = 0;
let antiTricheActif = false;

function activerAntiTriche() {
    if (antiTricheActif) return;
    antiTricheActif = true;

    function signalerViolation(type) {
        if (!sessionId) return;
        violationsCount++;

        const messages = {
            'tab_change': `Changement d'onglet détecté (${violationsCount} fois). Cet incident est enregistré.`,
            'window_blur':  `Changement de fenêtre détecté (${violationsCount} fois). Cet incident est enregistré.`
        };
        showNotification(messages[type] || 'Violation détectée. Cet incident est enregistré.', 'error');

        fetch(`${API_URL}/api/examen/anticheat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, type })
        }).catch(() => {});
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) signalerViolation('tab_change');
    });

    window.addEventListener('blur', () => {
        signalerViolation('window_blur');
    });
}

// Timer
function demarrerTimer(heureFin) {
    const fin = new Date(heureFin);
    const progressCircle = document.getElementById('progress-circle');
    const circumference = 2 * Math.PI * 26;
    
    timerInterval = setInterval(() => {
        const maintenant = new Date();
        const diff = fin - maintenant;
        
        if (diff <= 0) {
            clearInterval(timerInterval);
            timerElement.textContent = '00:00';
            soumettreExamen(true);
            return;
        }
        
        const minutes = Math.floor(diff / 60000);
        const secondes = Math.floor((diff % 60000) / 1000);
        timerElement.textContent = `${String(minutes).padStart(2, '0')}:${String(secondes).padStart(2, '0')}`;
        
        // Progress circle
        const totalTime = dureeExamen * 60 * 1000;
        const elapsed = totalTime - diff;
        const progress = elapsed / totalTime;
        if (progressCircle) {
            progressCircle.style.strokeDashoffset = circumference * (1 - progress);
        }
        
        // Alertes visuelles
        if (minutes < 5) {
            timerElement.classList.add('timer-warning');
            if (minutes < 1) {
                timerElement.classList.add('timer-critical');
            }
        }
    }, 1000);
}

// Compteur
function mettreAJourCompteur() {
    let repondues = 0;
    let skip = 0;
    
    // QCM
    reponsesQCM.forEach(r => {
        if (r === -1) skip++;
        else if (r !== null) repondues++;
    });
    
    // GraphQCM
    reponsesGraphQCM.forEach(r => {
        if (r?.type === 'je_ne_sais_pas') skip++;
        else if (r !== null) repondues++;
    });
    
    // Rédaction
    reponsesRedaction.forEach(r => {
        if (r === '__JE_NE_SAIS_PAS__') skip++;
        else if (r && r.trim()) repondues++;
    });
    
    const restantes = totalQuestions - repondues - skip;
    
    document.getElementById('questions-repondues').textContent = repondues;
    document.getElementById('questions-skip').textContent = skip;
    document.getElementById('questions-restantes').textContent = restantes;
    document.getElementById('questions-repondues-header').textContent = `${repondues} répondues`;
    
    // Progress bar
    const progress = ((repondues + skip) / totalQuestions) * 100;
    progressBar.style.width = `${progress}%`;
}

// Navigation
function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Modal
function ouvrirModalConfirmation() {
    let repondues = 0, skip = 0;
    
    reponsesQCM.forEach(r => { if (r === -1) skip++; else if (r !== null) repondues++; });
    reponsesGraphQCM.forEach(r => { if (r?.type === 'je_ne_sais_pas') skip++; else if (r !== null) repondues++; });
    reponsesRedaction.forEach(r => { if (r === '__JE_NE_SAIS_PAS__') skip++; else if (r && r.trim()) repondues++; });
    
    const restantes = totalQuestions - repondues - skip;
    
    let message = `Vous avez répondu à ${repondues} questions.`;
    if (skip > 0) message += ` ${skip} marquées "Je ne sais pas".`;
    if (restantes > 0) message += ` ${restantes} non répondues.`;
    
    document.getElementById('modal-message').textContent = message;
    document.getElementById('modal-confirmation').classList.remove('hidden');
}

function fermerModal() {
    document.getElementById('modal-confirmation').classList.add('hidden');
}

function confirmerSoumission() {
    fermerModal();
    soumettreExamen(false);
}

// Soumission
async function soumettreExamen(auto = false) {
    if (auto) {
        showNotification('⏰ Temps écoulé ! Soumission automatique...', 'warning');
    }
    
    clearInterval(timerInterval);
    btnSoumettre.disabled = true;
    btnSoumettre.innerHTML = '<span class="spinner inline-block w-5 h-5 mr-2"></span> Envoi...';
    
    try {
        const response = await fetch(`${API_URL}/api/examen/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                reponses: {
                    qcm: reponsesQCM,
                    redaction: reponsesRedaction,
                    graphQcm: reponsesGraphQCM
                }
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            showNotification(data.error, 'error');
            return;
        }
        
        afficherResultats(data.note);
        
    } catch (error) {
        console.error('Erreur:', error);
        showNotification('Erreur lors de la soumission', 'error');
    }
}

// Résultats
function afficherResultats(note) {
    document.getElementById('resultat-etudiant').textContent = 
        `${document.getElementById('info-etudiant').textContent}`;
    
    document.getElementById('note-pourcentage').textContent = `${note.pourcentage}%`;
    document.getElementById('note-qcm').textContent = `${note.qcm}/${note.qcmTotal || examenData.qcm.length}`;
    document.getElementById('note-graph').textContent = `${note.graphQcm}/${note.graphQcmTotal || 0}`;
    document.getElementById('note-auto').textContent = `${note.total}/${note.totalMax}`;
    document.getElementById('note-skip').textContent = `${(note.jeNeSaisPas?.qcm || 0) + (note.jeNeSaisPas?.graphQcm || 0)}`;
    
    pageExamen.classList.add('hidden');
    pageResultats.classList.remove('hidden');
    window.scrollTo(0, 0);
}

// Exposer les fonctions globales
window.scrollToSection = scrollToSection;
window.fermerModal = fermerModal;
window.confirmerSoumission = confirmerSoumission;
