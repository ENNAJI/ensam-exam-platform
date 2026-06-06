# QCM - Sécurité des Applications Mobiles

## Instructions
- Chaque question comporte une ou plusieurs bonnes réponses
- Les réponses correctes sont indiquées à la fin de chaque section

---

## PARTIE 1 : Comparaison Android vs iOS (20 questions)

### Q1. Quel mécanisme de sandboxing utilise Android ?
- A) App Sandbox uniquement
- B) SELinux + App Sandbox avec UID unique par app
- C) Secure Enclave
- D) Code Signing uniquement

### Q2. Depuis quelle version d'Android les runtime permissions ont-elles été introduites ?
- A) Android 4.0
- B) Android 5.0
- C) Android 6.0
- D) Android 8.0

### Q3. Quel pourcentage des appareils iOS adopte iOS 16+ en 6 mois ?
- A) 50%
- B) 65%
- C) Plus de 80%
- D) 95%

### Q4. Quelle est la principale différence de distribution entre Android et iOS ?
- A) Android utilise uniquement le Play Store
- B) iOS permet le sideloading facilement
- C) Android permet les stores alternatifs et le sideloading APK
- D) Les deux ont les mêmes politiques de distribution

### Q5. Quel type de kernel utilise iOS ?
- A) Linux
- B) XNU (hybride Mach + BSD)
- C) Windows NT
- D) FreeBSD pur

### Q6. Quelle technologie Android assure le contrôle d'accès obligatoire (MAC) ?
- A) App Sandbox
- B) SELinux
- C) Verified Boot
- D) SafetyNet

### Q7. Qu'est-ce que le Secure Enclave sur iOS ?
- A) Un antivirus intégré
- B) Un coprocesseur dédié avec mémoire isolée pour les clés cryptographiques
- C) Un firewall matériel
- D) Un système de backup

### Q8. Quelle attaque est plus fréquente sur Android que sur iOS ?
- A) Exploits kernel zero-day
- B) Malware trojanisé et Banking trojans
- C) Attaques via WebKit
- D) Chaînes d'exploitation Pegasus-like

### Q9. Pourquoi les exploits iOS sont-ils généralement plus coûteux ?
- A) Apple paie mieux les chercheurs
- B) L'écosystème fermé et la signature obligatoire rendent l'exploitation plus difficile
- C) iOS a plus d'utilisateurs
- D) Les développeurs iOS sont plus compétents

### Q10. Quel mécanisme iOS vérifie la chaîne de démarrage ?
- A) SafetyNet
- B) Secure Boot Chain
- C) Verified Boot
- D) SELinux

### Q11. Qu'est-ce que l'overlay attack sur Android ?
- A) Une attaque réseau
- B) Un malware avec fausse IHM superposée
- C) Une attaque sur le bootloader
- D) Un vol de données via Bluetooth

### Q12. Quel est le rôle de KASLR sur iOS ?
- A) Chiffrement des données
- B) Randomisation de l'espace d'adressage du kernel
- C) Vérification des signatures
- D) Gestion des permissions

### Q13. Qu'est-ce que ARM TrustZone ?
- A) Un antivirus ARM
- B) Une zone de stockage cloud
- C) Une technologie divisant le processeur en Normal World et Secure World
- D) Un protocole réseau sécurisé

### Q14. Quel composant Android stocke les clés cryptographiques de manière sécurisée ?
- A) SharedPreferences
- B) SQLite
- C) Android Keystore
- D) External Storage

### Q15. Quelle est la conclusion sur la surface d'attaque Android vs iOS ?
- A) Android : surface restreinte, iOS : surface large
- B) Android : surface large + attaques de masse, iOS : surface restreinte + attaques ciblées
- C) Les deux ont la même surface d'attaque
- D) iOS a plus d'attaques de masse

### Q16. Qu'est-ce que le Pointer Authentication sur iOS ?
- A) Authentification biométrique
- B) Protection contre les attaques de corruption de pointeurs
- C) Vérification des mots de passe
- D) Signature des applications

### Q17. Quel système Android permet l'attestation du device et la détection root ?
- A) SELinux
- B) SafetyNet / Play Integrity
- C) Verified Boot
- D) Android Keystore

### Q18. Combien de versions Android actives existe-t-il approximativement ?
- A) 10+
- B) 100+
- C) 1000+
- D) 50+

### Q19. Qu'est-ce que StrongBox sur Android ?
- A) Un coffre-fort physique
- B) Un HSM dédié avec CPU, mémoire et stockage isolés
- C) Une application de sécurité
- D) Un protocole de chiffrement

### Q20. Depuis quelle version iOS les privacy prompts contextuels sont-ils apparus ?
- A) iOS 10
- B) iOS 12
- C) iOS 14
- D) iOS 16

---

### RÉPONSES PARTIE 1
| Q | Réponse |
|---|---------|
| 1 | B |
| 2 | C |
| 3 | C |
| 4 | C |
| 5 | B |
| 6 | B |
| 7 | B |
| 8 | B |
| 9 | B |
| 10 | B |
| 11 | B |
| 12 | B |
| 13 | C |
| 14 | C |
| 15 | B |
| 16 | B |
| 17 | B |
| 18 | C |
| 19 | B |
| 20 | C |

---

## PARTIE 2 : Menaces Mobiles (15 questions)

### Q21. Quel pourcentage des applications mobiles sont infectées par du malware ?
- A) 5%
- B) 15%
- C) 25%
- D) 35%

### Q22. Qu'est-ce que le Smishing ?
- A) Phishing par email
- B) Phishing par SMS
- C) Phishing par appel vocal
- D) Phishing par QR code

### Q23. Qu'est-ce qu'une attaque Evil Twin ?
- A) Un malware qui se duplique
- B) Un faux point d'accès WiFi
- C) Une attaque sur les jumeaux numériques
- D) Un ransomware double

### Q24. Quel pourcentage des infections mobiles provient des apps tierces/sideloading ?
- A) 50%
- B) 70%
- C) Plus de 90%
- D) 30%

### Q25. Qu'est-ce que le Quishing ?
- A) Phishing par SMS
- B) Phishing par QR code malveillant
- C) Phishing par email
- D) Phishing vocal

### Q26. Quelle vulnérabilité permet l'attaque BlueBorne ?
- A) WiFi
- B) NFC
- C) Bluetooth (RCE)
- D) USB

### Q27. Quel type de données est souvent exposé par un stockage non sécurisé ?
- A) Données chiffrées uniquement
- B) SQLite non chiffré, logs, fichiers temporaires, clipboard
- C) Données système uniquement
- D) Métadonnées réseau

### Q28. Qu'est-ce que le SSL Stripping ?
- A) Suppression du certificat SSL
- B) Downgrade d'une connexion HTTPS vers HTTP
- C) Vol de certificats
- D) Chiffrement SSL renforcé

### Q29. Quel est le taux de croissance annuel du phishing mobile ?
- A) +10%
- B) +25%
- C) +50%
- D) +75%

### Q30. Qu'est-ce qu'un Banking Trojan ?
- A) Un virus bancaire légitime
- B) Un malware volant les credentials bancaires
- C) Une application bancaire officielle
- D) Un outil de test bancaire

### Q31. Quel pourcentage des permissions sensibles sont accordées sans lecture ?
- A) 50%
- B) 70%
- C) 90%+
- D) 30%

### Q32. Qu'est-ce que le Vishing ?
- A) Phishing par vidéo
- B) Phishing par SMS
- C) Phishing par appel vocal
- D) Phishing visuel

### Q33. Quel risque pose un Content Provider mal configuré ?
- A) Crash de l'application
- B) Accès non autorisé aux données
- C) Lenteur du système
- D) Problèmes d'affichage

### Q34. Qu'est-ce qu'une attaque Man-in-the-Middle (MitM) ?
- A) Interception des communications entre deux parties
- B) Attaque physique sur le device
- C) Vol du téléphone
- D) Attaque sur le bootloader

### Q35. Quel pourcentage des apps sont vulnérables aux attaques réseau ?
- A) 10%
- B) 20%
- C) 30%
- D) 40%

---

### RÉPONSES PARTIE 2
| Q | Réponse |
|---|---------|
| 21 | B |
| 22 | B |
| 23 | B |
| 24 | C |
| 25 | B |
| 26 | C |
| 27 | B |
| 28 | B |
| 29 | C |
| 30 | B |
| 31 | C |
| 32 | C |
| 33 | B |
| 34 | A |
| 35 | C |

---

## PARTIE 3 : Architecture et Sandbox Android (20 questions)

### Q36. Quelle est la plage d'UID Linux attribuée aux applications Android ?
- A) 1-999
- B) 1000-9999
- C) 10000-19999
- D) 20000-29999

### Q37. Quelle permission Unix est appliquée au répertoire /data/data/ d'une app ?
- A) 755
- B) 644
- C) 700
- D) 777

### Q38. Quel mécanisme IPC sécurisé utilise Android ?
- A) Sockets uniquement
- B) Binder IPC
- C) Shared Memory uniquement
- D) Pipes Unix

### Q39. Combien de types de permissions Android existe-t-il ?
- A) 2
- B) 3
- C) 4
- D) 5

### Q40. Quelle permission est de type "Normal" ?
- A) CAMERA
- B) INTERNET
- C) LOCATION
- D) CONTACTS

### Q41. Quelle permission est de type "Dangerous" ?
- A) BLUETOOTH
- B) RECEIVE_BOOT_COMPLETED
- C) CAMERA
- D) INTERNET

### Q42. Combien de groupes de permissions dangereuses existe-t-il ?
- A) 5
- B) 7
- C) 9
- D) 11

### Q43. Quelle méthode Kotlin vérifie si une permission est accordée ?
- A) hasPermission()
- B) checkSelfPermission()
- C) verifyPermission()
- D) getPermissionStatus()

### Q44. Quelle est une mauvaise pratique concernant les permissions ?
- A) Demander au moment de l'utilisation
- B) Demander toutes les permissions au lancement
- C) Expliquer l'utilité à l'utilisateur
- D) Gérer gracieusement le refus

### Q45. Quel composant Android gère l'interface utilisateur ?
- A) Service
- B) Activity
- C) BroadcastReceiver
- D) ContentProvider

### Q46. Quel attribut doit être mis à "false" pour protéger un composant ?
- A) android:enabled
- B) android:exported
- C) android:visible
- D) android:protected

### Q47. Quel composant Android écoute les événements système comme BOOT ?
- A) Activity
- B) Service
- C) BroadcastReceiver
- D) ContentProvider

### Q48. Quel risque pose un Service exporté sans protection ?
- A) Affichage incorrect
- B) Exécution de code arbitraire
- C) Lenteur
- D) Crash au démarrage

### Q49. Quel algorithme de chiffrement utilise Android KeyStore ?
- A) DES uniquement
- B) MD5
- C) RSA, AES, HMAC, EC
- D) SHA-256 uniquement

### Q50. Qu'est-ce que StrongBox apporte par rapport au TEE standard ?
- A) Plus de capacité
- B) HSM complètement séparé avec résistance aux attaques physiques
- C) Meilleure compatibilité
- D) Interface plus simple

### Q51. Depuis quelle version Android StrongBox est-il disponible ?
- A) Android 7
- B) Android 8
- C) Android 9
- D) Android 10

### Q52. Quel chiffrement utilise EncryptedSharedPreferences pour les valeurs ?
- A) AES-128-CBC
- B) AES-256-GCM
- C) RSA-2048
- D) 3DES

### Q53. Quel est l'impact sur les performances de SQLCipher ?
- A) Aucun impact
- B) ~10% de réduction
- C) ~50% de réduction
- D) ~90% de réduction

### Q54. Quelle couche Android contient les drivers et SELinux ?
- A) Application Framework
- B) ART
- C) Linux Kernel
- D) HAL

### Q55. Que signifie HAL dans l'architecture Android ?
- A) High Availability Layer
- B) Hardware Abstraction Layer
- C) Host Application Layer
- D) Hybrid Access Layer

---

### RÉPONSES PARTIE 3
| Q | Réponse |
|---|---------|
| 36 | C |
| 37 | C |
| 38 | B |
| 39 | C |
| 40 | B |
| 41 | C |
| 42 | C |
| 43 | B |
| 44 | B |
| 45 | B |
| 46 | B |
| 47 | C |
| 48 | B |
| 49 | C |
| 50 | B |
| 51 | C |
| 52 | B |
| 53 | B |
| 54 | C |
| 55 | B |

---

## PARTIE 4 : Architecture iOS (20 questions)

### Q56. Quelles sont les couches du stack iOS (du bas vers le haut) ?
- A) Core OS, Media Layer, Core Services, Cocoa Touch
- B) Core OS, Core Services, Media Layer, Cocoa Touch
- C) Cocoa Touch, Media Layer, Core Services, Core OS
- D) Kernel, Framework, Application

### Q57. Quel est le système d'exploitation du Secure Enclave ?
- A) iOS
- B) sepOS (microkernel Mach)
- C) watchOS
- D) Linux

### Q58. Quelle est la première étape du Secure Boot sur iOS ?
- A) iBoot
- B) LLB
- C) Boot ROM (code immutable)
- D) Kernel XNU

### Q59. Que se passe-t-il si la vérification de signature échoue au boot ?
- A) Le système continue normalement
- B) Un avertissement s'affiche
- C) Arrêt immédiat (mode recovery/DFU)
- D) Redémarrage automatique

### Q60. Combien de types de certificats développeur iOS existe-t-il ?
- A) 2
- B) 3
- C) 4
- D) 5

### Q61. Quelle est la limite de devices pour un certificat Ad Hoc ?
- A) 10
- B) 50
- C) 100
- D) Illimité

### Q62. Quelle est la durée de validité d'un profil de provisioning gratuit ?
- A) 1 jour
- B) 7 jours
- C) 30 jours
- D) 1 an

### Q63. Qu'est-ce que le fichier embedded.mobileprovision ?
- A) Le binaire de l'application
- B) Le profil de provisioning embarqué
- C) Les ressources graphiques
- D) La base de données

### Q64. Quelle étape du review App Store détecte les API privées ?
- A) Review manuelle
- B) Analyse automatisée
- C) Tests fonctionnels
- D) Vérification métadonnées

### Q65. Quel est un critère de rejet courant sur l'App Store ?
- A) Application trop petite
- B) Utilisation d'API privées
- C) Trop de fonctionnalités
- D) Design trop moderne

### Q66. Quel dossier iOS contient le binaire signé en lecture seule ?
- A) Documents/
- B) Library/
- C) Bundle/
- D) tmp/

### Q67. Quel dossier iOS est sauvegardé sur iCloud/iTunes ?
- A) tmp/
- B) Documents/
- C) Caches/
- D) Bundle/

### Q68. Depuis quelle version iOS NSCameraUsageDescription est obligatoire ?
- A) iOS 8
- B) iOS 10
- C) iOS 12
- D) iOS 14

### Q69. Quel service iOS gère le Keychain ?
- A) SpringBoard
- B) securityd
- C) launchd
- D) kernel

### Q70. Quel algorithme de chiffrement utilise le Keychain iOS ?
- A) DES
- B) AES-256
- C) RSA-1024
- D) MD5

### Q71. Quelle classe Data Protection offre la sécurité maximale ?
- A) NSFileProtectionNone
- B) NSFileProtectionCompleteUntilFirstUserAuthentication
- C) NSFileProtectionComplete
- D) NSFileProtectionCompleteUnlessOpen

### Q72. Quelle classe Data Protection est le défaut sur iOS ?
- A) NSFileProtectionNone
- B) NSFileProtectionComplete
- C) NSFileProtectionCompleteUntilFirstUserAuthentication
- D) NSFileProtectionCompleteUnlessOpen

### Q73. Quelle attribut Keychain est recommandé pour l'accessibilité ?
- A) kSecAttrAccessibleAlways
- B) kSecAttrAccessibleWhenUnlocked
- C) kSecAttrAccessibleAfterFirstUnlock
- D) kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly

### Q74. Que protège le SHSH sur iOS ?
- A) Les données utilisateur
- B) Contre le rollback vers d'anciennes versions iOS
- C) Les mots de passe
- D) Les photos

### Q75. Quelle limite a le review App Store ?
- A) Détecte 100% des malwares
- B) Bypass possible via code distant (JS hot-patching)
- C) Instantané
- D) Gratuit pour les développeurs

---

### RÉPONSES PARTIE 4
| Q | Réponse |
|---|---------|
| 56 | B |
| 57 | B |
| 58 | C |
| 59 | C |
| 60 | C |
| 61 | C |
| 62 | B |
| 63 | B |
| 64 | B |
| 65 | B |
| 66 | C |
| 67 | B |
| 68 | B |
| 69 | B |
| 70 | B |
| 71 | C |
| 72 | C |
| 73 | B |
| 74 | B |
| 75 | B |

---

## PARTIE 5 : Questions de Synthèse (10 questions)

### Q76. Quelle plateforme a une intégration hardware-software plus verticale ?
- A) Android
- B) iOS
- C) Les deux sont équivalentes
- D) Dépend du fabricant

### Q77. Quel mécanisme est commun à Android et iOS pour l'isolation des apps ?
- A) SELinux
- B) Sandboxing
- C) Secure Enclave
- D) Play Integrity

### Q78. Quelle plateforme dépend du constructeur pour la qualité du TEE ?
- A) iOS
- B) Android
- C) Les deux
- D) Aucune

### Q79. Quel type d'attaquant cible principalement iOS ?
- A) Cybercriminel opportuniste
- B) Malware de masse
- C) APT étatique avec exploits sophistiqués
- D) Script kiddies

### Q80. Quelle est la principale protection contre le sideloading malveillant sur iOS ?
- A) Antivirus intégré
- B) Code Signing obligatoire + App Store exclusif
- C) Firewall
- D) VPN intégré

### Q81. Quel mécanisme Android équivaut au Secure Enclave iOS ?
- A) SELinux
- B) TEE (ARM TrustZone) / StrongBox
- C) Verified Boot
- D) SafetyNet

### Q82. Pourquoi le jailbreak iOS est-il risqué ?
- A) Il améliore les performances
- B) Il cause la perte quasi-totale des protections de sécurité
- C) Il est illégal partout
- D) Il endommage le hardware

### Q83. Quel framework Android permet le chiffrement transparent des SharedPreferences ?
- A) Room
- B) Jetpack Security Library
- C) Retrofit
- D) Dagger

### Q84. Quelle est la différence clé entre les mises à jour Android et iOS ?
- A) Android est plus rapide
- B) iOS : OTA direct Apple, Android : dépend fabricant/opérateur
- C) Les deux sont identiques
- D) Android n'a pas de mises à jour

### Q85. Quel composant vérifie l'intégrité du système au démarrage sur Android ?
- A) SafetyNet
- B) Verified Boot
- C) SELinux
- D) Play Protect

---

### RÉPONSES PARTIE 5
| Q | Réponse |
|---|---------|
| 76 | B |
| 77 | B |
| 78 | B |
| 79 | C |
| 80 | B |
| 81 | B |
| 82 | B |
| 83 | B |
| 84 | B |
| 85 | B |

---

## TABLEAU RÉCAPITULATIF DES RÉPONSES

| Question | Réponse | Question | Réponse | Question | Réponse |
|----------|---------|----------|---------|----------|---------|
| 1 | B | 31 | C | 61 | C |
| 2 | C | 32 | C | 62 | B |
| 3 | C | 33 | B | 63 | B |
| 4 | C | 34 | A | 64 | B |
| 5 | B | 35 | C | 65 | B |
| 6 | B | 36 | C | 66 | C |
| 7 | B | 37 | C | 67 | B |
| 8 | B | 38 | B | 68 | B |
| 9 | B | 39 | C | 69 | B |
| 10 | B | 40 | B | 70 | B |
| 11 | B | 41 | C | 71 | C |
| 12 | B | 42 | C | 72 | C |
| 13 | C | 43 | B | 73 | B |
| 14 | C | 44 | B | 74 | B |
| 15 | B | 45 | B | 75 | B |
| 16 | B | 46 | B | 76 | B |
| 17 | B | 47 | C | 77 | B |
| 18 | C | 48 | B | 78 | B |
| 19 | B | 49 | C | 79 | C |
| 20 | C | 50 | B | 80 | B |
| 21 | B | 51 | C | 81 | B |
| 22 | B | 52 | B | 82 | B |
| 23 | B | 53 | B | 83 | B |
| 24 | C | 54 | C | 84 | B |
| 25 | B | 55 | B | 85 | B |
| 26 | C | 56 | B | | |
| 27 | B | 57 | B | | |
| 28 | B | 58 | C | | |
| 29 | C | 59 | C | | |
| 30 | B | 60 | C | | |

---

## BARÈME SUGGÉRÉ

- **85-75 points** : Excellent (A)
- **74-64 points** : Très bien (B)
- **63-51 points** : Bien (C)
- **50-43 points** : Passable (D)
- **< 43 points** : Insuffisant (F)

---

*Document généré pour le contrôle de Sécurité des Applications Mobiles*
