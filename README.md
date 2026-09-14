# Movie Still Lobby Card Generator

A mobile-first, browser-based generator that creates a collectible five-card lobby-card set from a user-supplied movie file.

## Purchase

- **5 lobby cards per set**
- **1 StarCoin per completed set**
- Uses the same Control Phi / StarQuest StarCoin balance earned by confirmed channel shares.
- StarCoin is charged only after all five cards render successfully.
- A completed purchase records a set ID, owner wallet ID, five selected timestamps, scene-caption data, and a cryptographic uniqueness fingerprint in the shared wallet ledger.
- The ownership record identifies the generated card set. It does not transfer copyright in the underlying movie.

## How the cards are made

- The movie is processed locally and is never uploaded by the page.
- The generator samples dozens of scenes throughout the complete movie.
- Candidate frames are scored for exposure, contrast, color, visual detail and motion.
- Near-duplicate frames are rejected.
- Earlier frame signatures and timestamps for the same movie are remembered on the device so later purchases deliberately move to different scenes.
- Five selected scenes are spaced across the film instead of clustering around one sequence.
- Each card is rendered as a **10×8-inch landscape card at 300 DPI (3000×2400 PNG)** with a clean white lobby-card border.
- Classic cards include the movie title, card number, timestamp, set ID and scene description.
- The browser creates a visual description from composition, brightness, motion and face detection when available. Every description is editable before download so the owner can make the scene wording exact.

## Uniqueness

Every set receives a random nonce plus a SHA-256 fingerprint derived from the movie, five frame signatures and timestamps. Local history strongly prevents repeat scenes on later sets from the same device. A future shared ledger can use the existing fingerprint field to enforce network-wide global uniqueness.

## Demo

`demo.html` shows a completed five-card presentation using public-domain screenshots from Buster Keaton's *The General* (1926), so the card design can be inspected without spending a StarCoin.

## Rights

Only use public-domain, licensed, owned, or otherwise authorized footage. Users must confirm they have permission to create and use stills from the selected movie before generating a set.
