# -*- coding: utf-8 -*-
"""docs/REFERENCES.md → docs/REFERENCES.xlsx（文獻管理表）。
執行：python docs/build_refs_xlsx.py   （需要 openpyxl）
工作表：文獻清單（每筆一列，含開放 PDF 下載來源與建議的本機檔名）、規則對應、說明。
REFERENCES.md 仍是主檔；改了 md 之後重跑這個檔即可。"""
import os, re
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

HERE = os.path.dirname(os.path.abspath(__file__))
MD = os.path.join(HERE, 'REFERENCES.md')
OUT = os.path.join(HERE, 'REFERENCES.xlsx')

# 開放 PDF 的直接下載來源（只列可免費取得的；付費文獻留空，由使用者自行補檔）
OPEN_PDF = {
    4: 'https://arxiv.org/pdf/2406.09106', 5: 'https://arxiv.org/pdf/2609.06170',
    11: 'https://mtlsites.mit.edu/researchgroups/Metrology/PAPERS/ICMTS-copper-tutorial.pdf',
    12: 'https://escholarship.org/content/qt0gh6k3fz/qt0gh6k3fz.pdf',
    13: 'https://dspace.mit.edu/entities/publication/2c287a6f-4036-49dd-973d-7f650f7d7ff3（頁面內有 PDF 連結）',
    14: 'https://www.mdpi.com/2079-9268/8/2/20/pdf',
    15: 'https://arxiv.org/pdf/2410.06133', 16: 'https://arxiv.org/pdf/2603.13713', 17: 'https://arxiv.org/pdf/2603.29174',
    18: 'https://arxiv.org/pdf/2610.06464', 19: 'https://arxiv.org/pdf/2603.21910', 20: 'https://arxiv.org/pdf/2508.07740',
    22: 'https://ewh.ieee.org/r5/denver/sscs/Presentations/2003_09_Loke.pdf',
    23: 'https://ewh.ieee.org/r5/denver/sscs/References/2009_09_Gambino.pdf',
    24: 'https://www.intechopen.com/chapter/pdf-download/58180',
    25: 'https://www.mdpi.com/2079-9292/11/18/2914/pdf',
    26: 'https://www.nxp.com/docs/en/white-paper/IITC_2003_CU_AIRGAP_INTER.pdf',
    27: 'https://www.semiconductors.org/wp-content/uploads/2018/06/6_2015-ITRS-2.0_Interconnect.pdf',
    28: 'https://arxiv.org/pdf/2508.00193', 29: 'https://arxiv.org/pdf/2304.13808',
}


def cells(line):
    return [c.strip() for c in line.strip().strip('|').split('|')]


def parse(md):
    refs, maps, batch, batch_title, in_map = [], [], 1, '', False
    for line in md.splitlines():
        if line.startswith('# '):
            m = re.match(r'# 第 (\d+) 批', line)
            batch = int(m.group(1)) if m else 1
            batch_title = line[2:].strip()
            in_map = False
        elif line.startswith('## ') and '對應' in line:
            in_map = True
        elif line.startswith('| ') and not line.startswith('|---') and not line.startswith('| #') and not line.startswith('| 規則'):
            c = cells(line)
            if in_map and len(c) == 2:
                maps.append((batch, c[0], c[1]))
            elif not in_map and len(c) >= 7 and c[0].isdigit():
                n = int(c[0])
                cit = c[2].replace('**', '')
                year = (re.findall(r'\((\d{4})\)', cit) or re.findall(r'(\d{4})', cit) or [''])[-1]
                arx = re.search(r'arXiv:(\d{4}\.\d{4,5})', cit)
                doi = re.search(r'doi\.org/(\S+)', c[3])
                first = re.split(r',|"', cit)[0].strip()
                first = re.sub(r'\s*\(.*?\)', '', first).split(' et al')[0]
                surname = first.split()[-1] if first and not first.startswith('"') else 'paper'
                tag = re.sub(r'[^A-Za-z0-9]', '', surname)
                if arx: tag = 'arXiv_' + arx.group(1)
                elif not tag or tag.isdigit(): tag = re.sub(r'[^A-Za-z0-9]', '', c[1].split(' ')[0]) or 'ref'
                local = f"{n:02d}_{tag}_{year}.pdf"
                refs.append(dict(batch=batch, n=n, topic=c[1].replace('**', ''), cit=cit, link=c[3],
                                 ident=('arXiv:' + arx.group(1)) if arx else ('DOI ' + doi.group(1)) if doi else '',
                                 year=year, support=c[4], access=c[5], verified=c[6], pdf=OPEN_PDF.get(n, ''), local=local))
    return refs, maps


def main():
    md = open(MD, encoding='utf-8').read()
    refs, maps = parse(md)
    wb = Workbook()
    head_fill = PatternFill('solid', fgColor='1F3B63'); head_font = Font(bold=True, color='FFFFFF')
    thin = Side(style='thin', color='D0D5DD'); border = Border(left=thin, right=thin, top=thin, bottom=thin)
    wrap = Alignment(wrap_text=True, vertical='top')

    ws = wb.active; ws.title = '文獻清單'
    cols = [('批次', 6), ('#', 5), ('主題', 26), ('書目', 60), ('年份', 7), ('識別碼（DOI／arXiv）', 26), ('連結', 44), ('取得', 12),
            ('開放 PDF 下載來源（付費者留空）', 50), ('本機檔名（建議，放 docs/papers/）', 26), ('本機已存檔', 10), ('支持哪條診斷概念', 70), ('驗證', 8)]
    for j, (h, w) in enumerate(cols, 1):
        c = ws.cell(row=1, column=j, value=h); c.fill = head_fill; c.font = head_font; c.alignment = Alignment(wrap_text=True, vertical='center'); c.border = border
        ws.column_dimensions[get_column_letter(j)].width = w
    for i, r in enumerate(refs, 2):
        row = [r['batch'], r['n'], r['topic'], r['cit'], r['year'], r['ident'], r['link'], r['access'], r['pdf'], r['local'], '', r['support'], r['verified']]
        for j, v in enumerate(row, 1):
            c = ws.cell(row=i, column=j, value=v); c.alignment = wrap; c.border = border
            if j in (7, 9) and isinstance(v, str) and v.startswith('http'):
                c.hyperlink = v.split('（')[0]; c.font = Font(color='1D4ED8', underline='single')
        if not r['pdf']:
            ws.cell(row=i, column=9).fill = PatternFill('solid', fgColor='F3F4F6')
    ws.freeze_panes = 'C2'; ws.auto_filter.ref = f"A1:{get_column_letter(len(cols))}{len(refs) + 1}"
    ws.row_dimensions[1].height = 32

    ws2 = wb.create_sheet('規則對應')
    for j, (h, w) in enumerate([('批次', 6), ('規則／功能', 70), ('引用', 24)], 1):
        c = ws2.cell(row=1, column=j, value=h); c.fill = head_fill; c.font = head_font; c.border = border
        ws2.column_dimensions[get_column_letter(j)].width = w
    for i, (b, rule, cite) in enumerate(maps, 2):
        for j, v in enumerate([b, rule, cite], 1):
            c = ws2.cell(row=i, column=j, value=v); c.alignment = wrap; c.border = border
    ws2.freeze_panes = 'A2'

    ws3 = wb.create_sheet('說明')
    notes = [
        '主檔是 docs/REFERENCES.md；這份 Excel 由 docs/build_refs_xlsx.py 產生，改 md 後重跑即可。',
        '「開放 PDF 下載來源」只列可免費取得的（arXiv、MDPI、IntechOpen、作者或學會公開的 PDF）；付費文獻（IEEE、Wiley、AIP、Annual Reviews、IBM J. Res. Dev.）留空，請自行從有訂閱的管道取得。',
        '「本機檔名」是建議值：編號_第一作者_年份.pdf，放在 docs/papers/；存好後在「本機已存檔」打 V。',
        'arXiv 的文獻同時存在 alphaXiv 資料夾「BEOL knowledge（戰報知識庫參考）」，可線上讀全文與做筆記。',
        '「驗證」欄：✔ = 本次已確認連結可解析；DOI = 以標準 DOI 登錄但出版社頁面本次未能讀取。',
        '「支持哪條診斷概念」對應 src/report/rules_base.js 的原因／檢查文字與 App.XLAYER 跨層表；知識庫規則的 source 欄可填「REFERENCES #編號」。',
    ]
    ws3.column_dimensions['A'].width = 120
    for i, t in enumerate(notes, 1):
        c = ws3.cell(row=i, column=1, value=t); c.alignment = wrap
    wb.save(OUT)
    print(f'wrote {OUT}: {len(refs)} refs, {len(maps)} rule mappings')


if __name__ == '__main__':
    main()
