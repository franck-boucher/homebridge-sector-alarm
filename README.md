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

`hb-service add` **n’accepte pas** une source GitHub (`github:user/repo`, une URL, un fichier `.tgz`). Il ne prend qu’un nom de paquet npm du type `homebridge-…`, puis l’installe depuis le registre npm. D’où l’erreur `Invalid plugin name` si tu lances :

```bash
hb-service add github:franck-boucher/homebridge-sector-alarm
```

Tant que le plugin n’est pas publié sur npm, installe-le avec `npm` dans le dossier Homebridge, via `hb-shell` (le Node de Homebridge, `/opt/homebridge`).

### Sur une Raspberry Pi (Homebridge officiel)

Les plugins vont dans `/var/lib/homebridge/node_modules`. Vérifie dans l’UI (carte Status) que Node.js est en **22** ou **24** — c’est ce que le plugin exige.

**1. Installer depuis GitHub**

En SSH :

```bash
sudo hb-shell
cd /var/lib/homebridge
npm install github:franck-boucher/homebridge-sector-alarm
```

Ou dans l’UI Homebridge : Developer Tools → Terminal (sans `sudo`) :

```bash
cd /var/lib/homebridge
npm install github:franck-boucher/homebridge-sector-alarm
```

Le script `prepare` compile le TypeScript au moment de l’install : pas besoin d’avoir le dossier `dist` dans Git. Quitte `hb-shell` avec Ctrl+D, puis redémarre :

```bash
sudo hb-service restart
```

**2. Configurer** : Plugins → Sector Alarm → Settings. Renseigne l’email et le mot de passe Mes Pages, plus le code PIN du clavier.

**3. Redémarrer** Homebridge si ce n’est pas déjà fait, puis ajouter les accessoires dans l’app Maison.

Si l’install GitHub échoue (souvent parce que TypeScript n’est pas compilé), clone, compile, puis installe le paquet local **avec `npm`**, pas `hb-service add` :

```bash
cd /tmp
git clone https://github.com/franck-boucher/homebridge-sector-alarm.git
cd homebridge-sector-alarm
sudo hb-shell   # utilise le Node de Homebridge (/opt/homebridge), pas celui du système
npm install
npm run build
npm pack
cd /var/lib/homebridge
npm install /tmp/homebridge-sector-alarm/homebridge-sector-alarm-0.1.0.tgz
```

Quitte `hb-shell` (Ctrl+D), puis `sudo hb-service restart`.

### Publier sur npm (optionnel)

Utile seulement si tu veux que le plugin apparaisse dans la recherche de l’UI, et pour pouvoir ensuite utiliser `hb-service add homebridge-sector-alarm`. Il faut un compte [npmjs.com](https://www.npmjs.com/), puis depuis une machine de dev :

```bash
npm login
npm publish
```

Ensuite, sur le Pi : Plugins → rechercher `homebridge-sector-alarm` → Install. Ou :

```bash
sudo hb-service add homebridge-sector-alarm
```

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
      "exposeClimate": true
    }
  ]
}
```

| Champ | Obligatoire | Description |
| --- | --- | --- |
| `email` / `password` | oui | Identifiants Mes Pages |
| `code` | oui | Code PIN du clavier (armement, désarmement, serrures) |
| `panelId` | si plusieurs sites | ID du panneau. Laissé vide s’il n’y a qu’un site. |
| `pollInterval` | non | Rafraîchissement alarme / capteurs / prises / serrures, en secondes (défaut 60, min 15) |
| `exposeSensors` | non | Portes / fenêtres, fuites, fumée (défaut `true`) |
| `exposePlugs` | non | Prises connectées (défaut `true`) |
| `exposeLocks` | non | Serrures (défaut `true`) |
| `exposeClimate` | non | Température / humidité (défaut `true`, poll 15 min) |

## Accessoires HomeKit

| Sector | HomeKit | Notes |
| --- | --- | --- |
| Panneau d’alarme | Security System | 3 modes Sector, libellés HomeKit : Désactivé, Au domicile (partiel), Nuit (partiel), Absent (total). |
| Portes / fenêtres | Contact Sensor | HouseCheck, panneaux récents |
| Prises | Outlet | État cloud, mise à jour au poll suivant |
| Serrures | Lock | Utilise le `code` configuré |
| Température / humidité | Temperature / Humidity | |
| Fuite / fumée | Leak / Smoke | Si l’API les expose |

Le panneau hors ligne est signalé via **Status Fault**. Sector renvoie parfois « armé absent » quand le panneau est offline : le plugin garde alors le dernier état connu (même logique que l’intégration Home Assistant).

## États d’alarme

HomeKit impose ses propres noms sur le service *Security System* (en français : **Au domicile**, **Absent**, **Nuit**, **Désactivé**). On ne peut pas les renommer en « Activation totale / partielle ». Sector n’a que 3 modes : **Nuit** arme en partiel, comme **Au domicile**. Nuit reste proposé dans Maison : HomeKit refuse l’écriture si le mode n’est pas annoncé comme valide.

| Sector | HomeKit |
| --- | --- |
| Désactivé (`1`) | Désactivé (Off) |
| Activation partielle (`2`) | Au domicile (Home / Stay) et Nuit (Night) |
| Activation totale (`3`) | Absent (Away) |

## Limites

- API non officielle, reverse-engineerée.
- Polling (60 s par défaut) : pas de push, les changements peuvent arriver avec un peu de retard.
- Les caméras ne sont pas exposées (endpoint HouseCheck caméras cassé côté API).
- Les panneaux « legacy » n’ont pas les capteurs HouseCheck (portes / fenêtres).
- Un polling trop fréquent a déjà retardé les notifications de l’app officielle : rester sur 60 s ou plus.

## Licence

MIT
