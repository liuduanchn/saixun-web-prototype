# -*- coding: utf-8 -*-
"""从「实例项目资料」目录的 .docx 中抽取纯文本 + 表格，输出到 _extract/ 便于人工/模型阅读。"""
import os
import re
from pathlib import Path

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph

SRC = Path(r"E:\JHC\6项目科研相关\202607金职大首届教学智能体大赛\实例项目资料")
OUT = Path(r"E:\JHC\6项目科研相关\202607金职大首届教学智能体大赛\saixun-web-prototype\scripts\_extract")
OUT.mkdir(parents=True, exist_ok=True)


def iter_block_items(parent):
    """按文档顺序遍历段落与表格。"""
    from docx.oxml.ns import qn

    body = parent.element.body
    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, parent)
        elif child.tag == qn("w:tbl"):
            yield Table(child, parent)


def clean(s: str) -> str:
    s = s.replace("\u00a0", " ").replace("\u3000", " ")
    return re.sub(r"\s+", " ", s).strip()


def extract(path: Path) -> str:
    doc = Document(str(path))
    lines = []
    for block in iter_block_items(doc):
        if isinstance(block, Paragraph):
            t = clean(block.text)
            if not t:
                continue
            style = (block.style.name or "").lower()
            if style.startswith("heading") or "标题" in (block.style.name or ""):
                lines.append(f"\n### {t}")
            else:
                lines.append(t)
        else:
            lines.append("\n[表格]")
            for row in block.rows:
                cells = [clean(c.text) for c in row.cells]
                # 去重相邻重复单元格（合并单元格会产生重复）
                dedup = []
                for c in cells:
                    if not dedup or dedup[-1] != c:
                        dedup.append(c)
                lines.append(" | ".join(dedup))
            lines.append("[/表格]\n")
    return "\n".join(lines)


def main():
    files = sorted(SRC.glob("*.docx"))
    index = []
    for f in files:
        try:
            text = extract(f)
        except Exception as e:  # noqa: BLE001
            text = f"[抽取失败] {e}"
        safe = re.sub(r"[^\w\-\.\u4e00-\u9fff]", "_", f.stem)[:60]
        target = OUT / f"{safe}.txt"
        target.write_text(text, encoding="utf-8")
        index.append((f.name, len(text), len(text.splitlines())))
        print(f"{f.name} -> {target.name}  chars={len(text)} lines={len(text.splitlines())}")
    print("\n=== 汇总 ===")
    for n, c, l in index:
        print(f"{c:>8} chars  {l:>5} lines  {n}")


if __name__ == "__main__":
    main()
