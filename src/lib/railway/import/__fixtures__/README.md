# Import fixtures — SAMPLE DATA ONLY

`cris-rbs-sample.csv` is a **small hand-built sample** in the CRIS RBS "Station
Details" column layout, used **solely to exercise the parser in tests**. It is
NOT the official station master and is NOT complete.

- The station codes/names in it are real, public Goa/Konkan stations so the Goa
  coverage test is meaningful.
- The `XGOODS1` / `XOLD1` rows are synthetic, clearly-fake codes used only to
  test the goods-only and inactive (expired `Valid To`) classification paths.
- Replace the real import source with the official CRIS RBS export or the OGD
  (data.gov.in) JSON — point the importer at it; do not grow this fixture into a
  pseudo-master.
