# Database Schema — Zero Seventeen Dashboard

## Source
`zero-seventeen-dashboard-default-rtdb-export-19.json` — Firebase Realtime Database export (2026-07-23)

---

## Root Nodes

### `admins`
Map of admin UIDs to admin profiles.
```
admins/
  {uid}/
    email: string
    name: string
    role: "admin"
```

### `categories`
Map of category keys (`cat_{num}`) to category definitions.
```
categories/
  {categoryKey}/
    description: string
    id: string        // e.g. "cat_1"
    media: string     // Image URL
    name: string      // Display name (uppercase)
    numericIds: number[]
    sortOrder: number
    type: "national" | "club" | "league" | "trophy" | "achievement"
    updatedAt: string (ISO 8601)
```

### `challenges`
Map of challenge game numbers to challenge definitions. Some challenges are empty shells (only `gameNumber`, `updatedAt`, `updatedBy`).
```
challenges/
  {gameNumber}/
    gameNumber: number
    difficulty?: "Beginner" | "Medium" | "Elite"
    publishedAt?: string (ISO 8601)
    players?: [
      {
        f: string          // First/family name
        g: string          // Given name
        id: number         // References players[{id}]
        image?: string     // Optional per-challenge image URL
        p: string          // Position
        v?: number[]       // Category numericIds linked to this player
      }
    ]
    remit?: [              // Grid layout: array of rows, each row is an array of cells
      [
        {
          displayName: string   // Short display code
          id: number            // Category numericId
          name: string          // Full name
          type: 1 | 2 | 3 | 6 | 8  // 1=national, 2=club, 3=league, 6=trophy, 8=achievement
        }
      ]
    ]
    updatedAt: string (ISO 8601)
    updatedBy: "admin" | "dashboard"
```

### `config`
Application configuration.
```
config/
  _t: number                                // Timestamp
  general/
    cardSize: number
    cardSizeOptions: number[]
    playerTimer: number                     // Seconds
    scoring/
      correctPoints: number
    startDate: string (ISO 8601)
    totalAttempts: number
  positions: string[]                       // e.g. ["Gardien", "Défense", "Milieu", "Attaquant"]
  theme/
    primaryColor: string                    // Hex color
    surfaceColor: string                    // Hex color
  updatedAt: string (ISO 8601)
```

### `deployments`
Map of deployment timestamp-IDs to deployment records.
```
deployments/
  {deploymentId}/                           // e.g. "2026-06-20T10-30-00-000Z"
    deployedAt: string (ISO 8601)
    deployedBy: "admin" | "dashboard"
    status: "success" | "failed"
    summary/
      challenges: number
      players: number
    vercelUrl: string                       // Vercel deployment URL
```

### `devLog`
Map of timestamp-based IDs to developer log entries.
```
devLog/
  {id}/
    id: string                              // Numeric timestamp string
    notes: string                           // Description (Arabic or English)
    status?: "done" | "new"
    timestamp: number                       // Unix timestamp ms
    title: string                           // Title (Arabic/English mix)
    type: "ميزة جديدة" | "تصحيح" | "تحسين"   // New feature | Correction | Improvement
```

### `elphenomeno`

Sub-system with its own challenges, organized into three game types.

```
elphenomeno/
  challenges/
    connections/
      {gameNumber}/
        gameNumber: number
        gameType: "connections"
        players: [                          // Same structure as base challenges.players
          {
            f: string
            g: string
            id: number
            image?: string
            p: string
            v?: number[]
          }
        ]
        remit: [                            // Same structure as base challenges.remit
          [
            {
              displayName: string
              id: number
              name: string
              type: 1 | 2 | 3 | 6 | 8
              image?: string
            }
          ]
        ]
        publishedAt?: string (ISO 8601)
        updatedAt: string (ISO 8601)
        updatedBy: string
      index/
        challenges: number[]                // Ordered list of challenge game numbers
        updatedAt: string (ISO 8601)
        version: number

    elphenomeno/
      {gameNumber}/
        gameNumber: number
        gameType: "elphenomeno"
        difficulty?: "Beginner" | "Medium" | "Elite"
        players: [
          {
            f: string
            g: string
            id: number
            image: string
            p: string
            v?: number[]
          }
        ]
        remit: [
          [
            {
              displayName: string
              id: number
              name: string
              type: 1 | 2 | 3 | 6 | 8
              image?: string
            }
          ]
        ]
        publishedAt?: string (ISO 8601)
        updatedAt: string (ISO 8601)
        updatedBy: string
      index/
        challenges: number[]
        updatedAt: string (ISO 8601)
        version: number

    impostor/
      {gameNumber}/
        gameNumber: number
        gameType: "impostor"
        impostorConfig: {
          categoryId: number                // Category numericId for the impostor theme
          impostorPlayerId: number          // 0 = first player is impostor
        }
        players: [
          {
            f: string
            g: string
            id: number
            image: string
            p: string
          }
        ]
        publishedAt?: string (ISO 8601)
        updatedAt: string (ISO 8601)
        updatedBy: string
      index/
        challenges: number[]
        updatedAt: string (ISO 8601)
        version: number
```

### players

Array indexed by numeric player IDs (1-based). Index 0 is always `null`.

```
players/
  [0]: null
  [id]: {
    categoryLinks: {
      achievement?: number[]    // Array of category numericIds
      club?: number[]
      league?: number[]
      national?: number[]
      trophy?: number[]
    }
    challengeCount: number
    difficulty: "Beginner" | "Medium" | "Elite"
    f: string                   // First/family name
    g: string                   // Given name
    id: number
    image: string               // Image URL (Cloudflare Workers or GitHub raw)
    positions: string[]         // e.g. ["Gardien"], ["Défense", "Milieu"]
    updatedAt: string (ISO 8601)
  }

```
