# Homebridge Sector Alarm

Plugin Homebridge pour [Sector Alarm](https://www.sectoralarm.com/) (Mes Pages / My Pages), y compris **la France**.

Il parle uniquement à l’API officielle `https://mypagesapi.sectoralarm.net` — le même backend que le portail [mespages.sectoralarm.fr](https://mespages.sectoralarm.fr/). Ce n’est **pas** un produit Sector Alarm : l’API est non documentée et peut changer.

Inspiré de l’intégration Home Assistant [gjohansson-ST/sector](https://github.com/gjohansson-ST/sector). L’ancien plugin [frli4797/homebridge-sector](https://github.com/frli4797/homebridge-sector) n’est plus maintenu (Homebridge accessory JS, package `sectoralarm`).

## Prérequis

- [Homebridge](https://homebridge.io/) 1.8+ ou 2.x
- Node.js 22 ou 24
- Un compte **Mes Pages** (email + mot de passe), pas le code du clavier

## Installation

**Tu n’as pas besoin de publier le plugin sur npm** pour l’utiliser chez toi. Publier sur npm sert seulement à le faire apparaître dans la recherche de l’onglet Plugins pour tout le monde.

### Sur une Raspberry Pi (Homebridge officiel)

Homebridge (image officielle ou paquet `apt`) installe les plugins avec `hb-service`, pas avec `npm install -g`. Les plugins vont dans `/var/lib/homebridge/node_modules`.

**1. Installer depuis GitHub**

Dans l’UI Homebridge : Developer Tools → Terminal (sans `sudo`) :

```bash
hb-service add github:franck-boucher/homebridge-sector-alarm
```

Ou en SSH :

```bash
sudo hb-service add github:franck-boucher/homebridge-sector-alarm
```

Le script `prepare` compile le TypeScript au moment de l’install : pas besoin d’avoir le dossier `dist` dans Git.

**2. Configurer** : Plugins → Sector Alarm → Settings. Renseigne l’email et le mot de passe Mes Pages, plus le code PIN du clavier.

**3. Redémarrer** Homebridge si ce n’est pas déjà fait, puis ajouter les accessoires dans l’app Maison.

Vérifie dans l’UI (carte Status) que Node.js est en **22** ou **24** — c’est ce que le plugin exige.

Si `hb-service add github:…` échoue (souvent parce que TypeScript n’est pas compilé), clone, compile, puis installe le paquet local :

```bash
cd /tmp
git clone https://github.com/franck-boucher/homebridge-sector-alarm.git
cd homebridge-sector-alarm
sudo hb-shell   # utilise le Node de Homebridge (/opt/homebridge), pas celui du système
npm install
npm run build
npm pack
# quitte hb-shell (Ctrl+D), puis :
sudo hb-service add /tmp/homebridge-sector-alarm/homebridge-sector-alarm-0.1.0.tgz
```

### Publier sur npm (optionnel)

Utile seulement si tu veux que le plugin apparaisse dans la recherche de l’UI. Il faut un compte [npmjs.com](https://www.npmjs.com/), puis depuis une machine de dev :

```bash
npm login
npm publish
```

Ensuite, sur le Pi : Plugins → rechercher `homebridge-sector-alarm` → Install.

### En local, pour développer

```bash
git clone https://github.com/franck-boucher/homebridge-sector-alarm.git
cd homebridge-sector-alarm
npm install
npm run build
npm link
```

Puis, dans le dossier Homebridge (`/var/lib/homebridge` sur le Pi) : `npm link homebridge-sector-alarm`. Sur le Pi, lance ces commandes via `sudo hb-shell` pour utiliser le Node de Homebridge.

## Configuration

```json
{
  "platforms": [
    {
      "platform": "SectorAlarm",
      "name": "Sector Alarm",
      "email": "vous@example.com",
      "password": "mot-de-passe-mes-pages",
      "code": "1234",
      "panelId": "",
      "pollInterval": 60,
      "exposeSensors": true,
      "exposePlugs": true,
      "exposeLocks": true,
      "exposeClimate": true,
      "allowDisarm": true,
      "allowLockControl": true
    }
  ]
}
```

| Champ | Obligatoire | Description |
| --- | --- | --- |
| `email` / `password` | oui | Identifiants Mes Pages |
| `code` | oui | Code PIN du clavier (armement, désarmement, serrures), 4 à 10 chiffres |
| `panelId` | si plusieurs sites | ID du panneau. Laissé vide s’il n’y a qu’un site. |
| `pollInterval` | non | Rafraîchissement alarme / capteurs / prises / serrures, en secondes (défaut 60, min 15) |
| `exposeSensors` | non | Portes / fenêtres, fuites, fumée (défaut `true`) |
| `exposePlugs` | non | Prises connectées (défaut `true`) |
| `exposeLocks` | non | Serrures (défaut `true`) |
| `exposeClimate` | non | Température / humidité (défaut `true`, poll 15 min) |
| `allowDisarm` | non | Autoriser HomeKit à désarmer (défaut `true`). `false` refuse la commande Désarmer ; l’état Off reste affiché si on désarme au clavier. |
| `allowLockControl` | non | Autoriser HomeKit à verrouiller / déverrouiller (défaut `true`) |

## Accessoires HomeKit

| Sector | HomeKit | Notes |
| --- | --- | --- |
| Panneau d’alarme | Security System | Désarmé, Maison (partiel), Absent (total). Nuit = partiel aussi. |
| Portes / fenêtres | Contact Sensor | HouseCheck, panneaux récents |
| Prises | Outlet | État cloud, mise à jour au poll suivant |
| Serrures | Lock | Utilise le `code` configuré |
| Température / humidité | Temperature / Humidity | |
| Fuite / fumée | Leak / Smoke | Si l’API les expose |

Le panneau hors ligne est signalé via **Status Fault**. Sector renvoie parfois « armé absent » quand le panneau est offline : le plugin garde alors le dernier état connu (même logique que l’intégration Home Assistant).

## États d’alarme

| Sector | HomeKit |
| --- | --- |
| Désarmé (`1`) | Off |
| Partiel (`2`) | Home (Stay). Night envoie aussi un armement partiel. |
| Armé (`3`) | Away |

## Limites

- API non officielle, reverse-engineerée.
- Polling (60 s par défaut) : pas de push, les changements peuvent arriver avec un peu de retard.
- Les caméras ne sont pas exposées (endpoint HouseCheck caméras cassé côté API).
- Les panneaux « legacy » n’ont pas les capteurs HouseCheck (portes / fenêtres).
- Un polling trop fréquent a déjà retardé les notifications de l’app officielle : rester sur 60 s ou plus.

## Sécurité

Ce plugin **n’ouvre aucun port** et n’expose pas d’API HTTP. Il parle en HTTPS sortant vers `mypagesapi.sectoralarm.net`, et Homebridge expose l’alarme à HomeKit via HAP (chiffré, appairage obligatoire).

### Est-ce qu’on peut se faire pirater depuis Internet ?

Pas via ce plugin directement. Un attaquant externe devrait passer par un de ces chemins :

1. **Apple Maison** — si tu as un hub (HomePod, Apple TV, iPad) et que le foyer est partagé, n’importe quel membre du foyer HomeKit peut commander l’alarme à distance. L’app Maison demande en général Face ID / code pour désarmer un *Security System*, mais les automations et certaines apps tierce peuvent contourner ce prompt.
2. **UI Homebridge exposée** (port 8581) — si l’interface est ouverte sur Internet sans mot de passe fort (ou sans HTTPS), quelqu’un peut lire `config.json` (email, mot de passe Mes Pages, **PIN clavier**) et tout commander.
3. **Compte Mes Pages volé** — le plugin se connecte avec email + mot de passe seulement (login API historique). Le PIN clavier est ensuite envoyé automatiquement.

Le plugin ne contourne pas le cloud Sector : désarmer depuis HomeKit envoie le PIN stocké à l’API officielle, comme l’app Mes Pages.

### Si quelqu’un a accès au Raspberry Pi

**Oui : il peut désarmer l’alarme, ouvrir les serrures, et voler le compte.** Les secrets sont en clair dans `/var/lib/homebridge/config.json` (`email`, `password`, `code`). Accès SSH, sauvegarde Homebridge, ou session UI = mêmes secrets. `allowDisarm: false` ne protège **pas** contre ça : l’attaquant peut relire le PIN et appeler Sector tout seul.

Traite le Pi comme un clavier d’alarme :

- Pas de port forwarding de Homebridge / SSH vers Internet.
- Mot de passe (ou clés) SSH fort, UI Homebridge authentifiée.
- Ne pas activer le *insecure accessory control* de Homebridge (`-I`) : ça permet de commander les accessoires sans appairage HomeKit.
- Permissions restrictives sur `config.json` (`chmod 600`).
- Compte Mes Pages dédié si Sector le permet, mot de passe unique.
- Optionnel : `"allowDisarm": false` si tu veux voir l’état dans Maison sans pouvoir désarmer depuis HomeKit (le clavier Sector reste le seul moyen de désarmer).

Un appareil sur le Wi‑Fi **sans** appairage HomeKit et **sans** accès au Pi ne peut pas commander l’alarme via ce plugin : HAP refuse les clients non pairés.

## Licence

MIT
