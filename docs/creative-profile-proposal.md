# MUMOO Creative Profile architecture proposal

Status: proposed for product-owner review. The new workflow is not yet implemented.

## User journey

1. Upload a song and choose a required creator-provided primary genre. Optionally add a secondary genre or influence, Spotify link, and artist/title.
2. Select exactly 15 seconds and audition the selection.
3. Choose Lyric Video or Visual.
4. Lyric Video uses supplied lyrics, WhisperX alignment, timing review and approved lyric-theme analysis where supported. Visual skips all lyric processing. Both paths use Music Analysis v1 for beats, BPM, energy, onsets and spectral features.
5. Show recommended ready-made compositions first, followed by the complete eligible catalog and user-uploaded media when implemented.
6. Preview and export a 15-second MP4.

The original full song remains in the browser. Hosted services receive only the selected 15-second clip. Skip unnecessary processing. An optional analysis failure is recorded as unavailable and must not block browsing or export.

## Genre selection

A searchable, versioned catalog contains broad genres and specific subgenres including Deep House, Slap House, G-House, Brazilian Funk Mandelão, Montagem, Afro House, Amapiano, Techno and Reggaeton. Exactly one primary choice is required. An optional secondary genre or influence and an Other / custom choice with nonempty bounded text are available. Search matches labels and aliases case-insensitively. Preserve the creator's stable catalog identifier, display label, catalog version and any custom spelling. Genre is user-provided and is never inferred from BPM or AI.

The optional Spotify URL is a reference field until any integration is separately reviewed. Artist and title may be manually entered or drawn from available metadata, with provenance and no invented values.

## Creative Profile contract

The versioned Creative Profile is a recommendation input separate from the renderer's composition. It contains:

- Source identity, selected offset in integer milliseconds and 15,000 ms duration.
- Required primary genre, optional secondary genre or influence, artistic direction and metadata with provenance.
- Video type, Lyric Video or Visual.
- Music Analysis v1 reference and ready, unavailable or error state, preserving BPM ambiguity and experimental downbeat status.
- For Lyric Video only, approved lyric text/timings and optional theme analysis with provenance and explicit unavailable status.
- Recommendation IDs, catalog version, eligibility and evidence-based reasons.

The renderer continues to consume separately versioned compositions and approved lyric cues. Composition versions 1 and 2 remain readable. Changing song or clip invalidates clip-derived analysis and lyric timings. Changing video type excludes inapplicable lyric processing. Changing genre or direction invalidates recommendations without redoing audio analysis. Bind results to source identity, offset and duration to reject stale responses.

## Recommendations

A catalog of rights-approved ready-made compositions records stable IDs, video-type eligibility, genre and influence tags, supported musical ranges, descriptive visual traits, and rights provenance. An explainable deterministic first iteration can rank eligible entries using creator genre and available verified audio features. Approved, supported lyric themes apply only to Lyric Video. Preserve BPM uncertainty and experimental downbeat status. Favor diversity when the eligible catalog permits. A custom or unknown genre falls back to other available evidence and full catalog browsing. Define weights and acceptance using real licensed assets before implementation.

## Current state and gaps

Staging currently has local WAV upload, waveform-based 15-second selection, browser WAV metadata, supplied-lyrics WhisperX alignment and review, instrumental continuation, Music Analysis v1 diagnostics, three Plain Colors presets, and browser MP4 export. Composition versions 1 and 2 exist. The current editor still exposes testing controls and does not implement the proposed journey.

Milestone 1 adds a required searchable genre selector with custom entry, an optional influence, and an explicit video-type step in the existing staging editor. These choices live in browser session state. Visual keeps the existing lyric cues available for switching back, but uses a lyric-free composition for its own preview and export. Existing source metadata and manually requested Music Analysis v1 remain available.

Still needed: a versioned genre catalog and Creative Profile persistence strategy, optional Spotify link and manual artist/title fields, approved lyric-theme method, rights-approved composition catalog, explainable recommendations, full eligible browsing and uploaded visual media in the new journey. No automatic transcription or genre model is required.

## Proposed implementation sequence

1. Define the catalog and Creative Profile contract, including migration and identity rules.
2. Add upload/required genre and video-type selection, with tests that Visual never invokes lyric processing.
3. Connect Music Analysis v1 and existing WhisperX only for the selected path. Test stale results and failures.
4. Add licensed compositions and full browsing, establishing assets and eligibility before ranking.
5. Add transparent recommendations and reasons, then preview and export through the existing renderer contract.
6. Consider lyric-theme analysis only after privacy, language coverage, cost and reliability are reviewed.

Each increment requires build, type checking, lint, relevant tests and a staging preview. Production deployment is excluded.

## Choices for product review

- Genre catalog scope and aliases, and whether secondary influences accept custom text.
- Composition assets, licenses, eligibility, recommendation count, diversity and tie rules.
- Lyric-theme method, language coverage, privacy and cost. Defer when unsupported.
- Spotify URL validation and any later API integration.
- Timing of accounts and cross-device persistence.
