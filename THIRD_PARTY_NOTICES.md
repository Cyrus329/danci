# Third-party notices

This project may build an offline context-candidate dataset from [Tatoeba](https://tatoeba.org/). The importer selects a record only when both the English sentence and its direct Mandarin Chinese (`cmn`) translation report the exact license `CC0 1.0`.

Tatoeba resources: [project](https://tatoeba.org/), [API](https://api.tatoeba.org/), and [downloads](https://tatoeba.org/en/downloads).

Retrieval date: 2026-07-26. Network access is used only by the build-time importer; the application runtime remains offline and does not call Tatoeba.
