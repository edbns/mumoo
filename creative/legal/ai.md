# AI Disclosure

**Last updated:** 19 November 2026  
**Contact:** moo@mumoo.app

**MUMOO creates audiovisual content. Users decide what to do with it.**

mumoo is a music-driven audiovisual creation platform. AI and automated systems assist with music analysis, lyric timing, mood interpretation, visual recommendations, and creative direction. The Director may select, cut, sequence, transform, and synchronize curated or user-provided visual media into finished videos. AI-assisted creative direction does not imply that the underlying footage is AI-generated. Under the workflow described in this draft, mumoo does not generate new source images, footage, or music using generative AI.

## Models and purposes
All models are open-source and run on servers we rent and control (Modal). No user content is sent to external AI companies and no user content is used to train any models.

- **Lyrics transcription and timing:** Whisper writes out the lyrics of the 15-second clip; an alignment model syncs each word to the music.
- **Lyric meaning:** An open text model (Qwen3-8B) reads the lyrics to suggest mood and themes that guide colours and pacing. Lyrics exist only in memory during the request and are never stored.
- **Genre suggestion:** An audio model (CLAP) creates a “style print” of the clip to suggest a genre. The print is kept only if you confirm the guess and is linked to the song, not to you as a person.
- **Photo cut-out:** Uploaded photos are processed by a small segmentation model (u2net) that separates the person from the background for certain templates. There is no face recognition or identification of any individual.
- **Internal library only:** An image model (Qwen2.5-VL) is used solely to sort mumoo’s own private stock library into mood boards. It never processes user uploads. The private library and mood boards are never accessible to users.

## Accuracy and responsibility
AI suggestions (transcription, timing, mood, genre) can be wrong or incomplete. You can edit them before creating videos. You are responsible for reviewing the output and for ensuring you have the rights to any song or other content you use.

## Ownership
You retain ownership of your uploaded content and any rights you independently hold in your original contributions to finished Creatives. You receive the finished-output usage licence described in the Terms, subject to applicable third-party rights. Private mood boards, source media, templates, and fonts remain mumoo’s or its licensors’; the underlying source assets are not transferred to users and are never made available as a standalone library.
