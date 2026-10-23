# Data

## ASVspoof 2019 Logical Access (LA)

The downloaded corpus is stored project-locally in `LA/` (about 7.4 GB); source
audio is not copied, converted, or modified. Its official structure is:

```text
LA/
  ASVspoof2019_LA_train/flac/    # official training audio
  ASVspoof2019_LA_dev/flac/      # official development audio
  ASVspoof2019_LA_eval/flac/     # official evaluation audio
  ASVspoof2019_LA_cm_protocols/  # authoritative CM labels and speaker IDs
data/raw/metadata.csv            # generated manifest
```

`metadata.csv` has `file,speaker,label,split`. `file` is a project-relative
FLAC path; `speaker` is the actual protocol speaker ID (for example `LA_0079`);
and labels follow VoxSentra's mapping: `bonafide` → `0` (Genuine), `spoof` →
`1` (AI-generated/Spoof). Labels and speakers are read only from the official
CM protocol files, never inferred from filenames.

The fixed official partitions are preserved: ASVspoof train → `train`, dev →
`val`, and eval → `test`. The loader recognizes `split` and keeps these sets
unchanged. This prevents evaluation audio from entering training and preserves
the protocol's disjoint speaker sets.

## Prepare and validate

From the project root:

```bash
python scripts/prepare_asvspoof.py
python scripts/prepare_asvspoof.py --validate
```

Validation reports class balance, per-split counts, speaker overlap, protocol
row errors, duplicated manifest entries, and each listed audio file's existence,
extension, readable header, and non-zero duration. It does not preprocess or
alter the corpus.
