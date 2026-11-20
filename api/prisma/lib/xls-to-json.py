"""Dump a legacy .xls workbook's cell values as JSON on stdout.

Used by `seed-budget-document.ts --objects` (specs/012 P3): the city sends its
appropriation ordinance's by-object (PAOO) tables as BIFF .xls, which ExcelJS
cannot read. Values only, one list per row; dates and formulas arrive as the
cached value. Needs `xlrd`; `readXls` runs it through `uv run --with xlrd`.

    uv run --no-project --with xlrd==2.0.2 python3 -I prisma/lib/xls-to-json.py <file.xls>
"""
import json
import sys

import xlrd


def main(path: str) -> None:
    book = xlrd.open_workbook(path)
    out = {"sheets": []}
    for sheet in book.sheets():
        rows = [
            [sheet.cell_value(r, c) for c in range(sheet.ncols)]
            for r in range(sheet.nrows)
        ]
        out["sheets"].append({"name": sheet.name, "rows": rows})
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main(sys.argv[1])
