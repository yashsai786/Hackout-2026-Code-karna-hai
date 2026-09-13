# Demo documents for Intake

Six documents, one per reading path — including a prose note that only the model-assisted path can read. Drop any of them on **Intake** (`/intake`), press **Read this
document**, and compare what appears with the column on the right. Every figure the page shows carries
the line or column it was read from; the photo also shows the OCR confidence.

| File | Path exercised | What Intake should show |
| --- | --- | --- |
| `bhilai-electricity-bill-2025-12.csv` | CSV table | Electricity · **18,450,000 kWh** · ₹13.84 cr for 2025-12 (the latest of three months in the file; the whole-file total of 54,000,000 kWh is stated in the evidence) · matched to Bhilai from the *Consumer* column |
| `bhilai-coal-purchase-register-2025-12.xlsx` | Spreadsheet table | Fuel · **22,500 tonnes** · ₹18.73 cr (from the *Amount* column, not the *Rate* column) · 2025-12 |
| `chandrapur-waste-manifest-2025-11.txt` | Plain text | Waste · **1,588 tonnes** · ₹22.23 L · 2025-11 |
| `dahej-furnace-oil-invoice-2025-12.pdf` | PDF with a text layer | Fuel · **1,860 KL furnace oil** · ₹10.08 cr · 2025-12 · with a key connected the model identifies the fuel and the record carries the furnace-oil factor (3.1 tCO₂e/KL) and is matched to Dahej |
| `surat-electricity-account-note-2025-12.txt` | Prose, no table | Electricity · **2,140,000 kWh** · ₹1.60 cr · 2025-12 · matched to Surat. Nothing here is a header or a labelled field — *"consumption stood at 2.14 million units… payable Rupees 1.6 crore"* — so the parser alone finds nothing; with a key connected the model reads it and every figure is verified against the text before it is accepted |
| `surat-electricity-bill-photo-2025-12.png` | Local OCR (photo) | Electricity · **2,140,000 kWh** · ₹1.60 cr · 2025-12 · read at ≈97% confidence |

All five are synthetic documents written for the demonstration: the plants are the seed plants, the
suppliers and terminals are real names used illustratively, and the figures are plausible for the
plant sizes involved. None is a real bill.

The confirmed record lands on the plant's factory page under *Source intake records* and is persisted
through the API; it does not change the annual baseline on its own — apply it on the process page.
