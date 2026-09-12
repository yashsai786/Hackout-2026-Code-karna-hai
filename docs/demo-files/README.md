# Demo documents for Intake

Five documents, one per reading path. Drop any of them on **Intake** (`/intake`), press **Read this
document**, and compare what appears with the column on the right. Every figure the page shows carries
the line or column it was read from; the photo also shows the OCR confidence.

| File | Path exercised | What Intake should show |
| --- | --- | --- |
| `bhilai-electricity-bill-2025-12.csv` | CSV table | Electricity · **54,000,000 kWh** · ₹40.50 cr · recorded against 2025-12, with a note that the file spans Oct–Dec and the figures are summed |
| `bhilai-coal-purchase-register-2025-12.xlsx` | Spreadsheet table | Fuel · **22,500 tonnes** · ₹18.73 cr (from the *Amount* column, not the *Rate* column) · 2025-12 |
| `chandrapur-waste-manifest-2025-11.txt` | Plain text | Waste · **1,588 tonnes** · ₹22.23 L · 2025-11 |
| `dahej-furnace-oil-invoice-2025-12.pdf` | PDF with a text layer | Fuel · **1,860 KL** · ₹10.08 cr · 2025-12 |
| `surat-electricity-bill-photo-2025-12.png` | Local OCR (photo) | Electricity · **2,140,000 kWh** · ₹1.60 cr · 2025-12 · read at ≈97% confidence |

All five are synthetic documents written for the demonstration: the plants are the seed plants, the
suppliers and terminals are real names used illustratively, and the figures are plausible for the
plant sizes involved. None is a real bill.

The confirmed record lands on the plant's factory page under *Source intake records* and is persisted
through the API; it does not change the annual baseline on its own — apply it on the process page.
