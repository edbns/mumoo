# Closed CLAP genre experiment

LAION larger_clap_music revision a0b4534a14f58e20944452dff00a22a06ce629d1 was evaluated on CPU using two fixed 10-second windows per 15-second clip. Its published model license was Apache 2.0. Checkpoint SHA-256 was 5c289311f4a030d768af7ffbfdecd01b008aa64824211899a4e59f4f9d154fd1.

A hosted synthetic test measured 18.18 seconds cold and 3.44 seconds warm end to end, with peak Python process RSS of 1,736,232,960 bytes. Synthetic silence and percussion received highly similar embeddings, approximately 0.9982 cosine similarity, and overlapping genre rankings. Direct model-forward scores agreed with worker scoring.

Two private creator-supplied reports used the same selections with a 16 kHz baseline and direct 48 kHz preparation. On both paths MAMACITA and MUTED ranked reggaeton first. MUTED Deep House ranked sixth of thirteen subgenres. Their direct 48 kHz embeddings had cosine similarity 0.98264 and 0.99046 across corresponding windows. Genre-score patterns remained strongly correlated. The 48 kHz path preserved more high-frequency energy without materially improving this comparison. Two songs do not establish general model accuracy, but the result was insufficient for MUMOO genre decisions.

The product owner closed this experiment in favor of creator-selected genre. CLAP is not part of the approved architecture. No private audio or diagnostic report is stored in this repository.
