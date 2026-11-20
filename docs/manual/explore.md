# Explore the data

**Explore** (`/explore`) lets anyone make a chart from the city's budget documents and share it.
No account is needed.

## On a computer: the workspace

On a screen at least 1,024 pixels wide, Explore opens as a full-screen **workspace**. Phones and
narrow windows keep the page described below.

- **Left:** the **source** (AIP programs, budget PPAs, accounts, income, budget over time and
  more), the **documents** to include, and the **fields**. Click a field to add it to the chart;
  click it again to take it off, or drag it onto a part of the sentence above the chart.
- **Above the chart**, a sentence says what it shows: *Show* **Estimated cost** *for each*
  **Office** *coloured by* **Fund** *where* **Office is …**. Each part is a menu: change the field,
  add it up another way (sum, average, smallest, largest), show it as a share of the total, a
  change from the year before, a rank or a running total, choose how many rows (top 10 and
  Other), or add a filter with **+**.
- **Marks** picks the chart: Automatic chooses one for you; bar, stacked bar, line, area,
  scatter, heat map, treemap, big number or table. A chart that cannot show your data is greyed out (two
  documents or two years are never stacked or added together). A chart that would mislead (a
  line across offices, which have no order, or a negative amount in a treemap) shows as the table
  instead, with one line saying why. With more than four colours, the chart splits into small
  charts side by side, one per colour, on the same scale.
- **Barangay** shows where the money goes in the city. The explorer reads the place from each
  project's own name ("Drainage, Kamagong St., Balatas"), so a project that names two barangays
  counts in both, and barangays are never added up. Money that names no barangay (city-wide work,
  or a name that does not say) is shown on its own beside the map. The map shows **pesos per
  resident**, using the 2020 census, because a map of totals mostly shows where people live.
- **Words in the budget** shows the words of program names, each as big as the money of the
  programs that use it (not how often it appears), coloured by the kind of spending it is most
  typical of, with the twelve largest listed beside it. A program uses several words, so the words
  are never added up. Click a word and choose **Keep only** to see the programs whose names use it. **Table** above the chart shows the
  same figures as a table, and **Records** lists the programs, PPAs or account lines behind it,
  50 at a time, with each one's office and amount; click a column name to sort. The arrow beside a
  program shows its projects and activities. Click a name to see all its details, a link to its
  page, and, under its own heading, how the explorer reads it (its labels, place and words).
- **Click a bar**, point or box (or a name in the table) to **keep only** it, **exclude** it,
  **drill down** (an office's programs, a cluster's sectors…) or **show its records**. Undo, or
  the **×** on the filter, takes you back.
- **Sheets** along the bottom: **+** adds one, double-click a name to rename it.
- **New dashboard** puts up to four sheets side by side. Click a bar in one and the others show
  only that value (a sheet with no such field says *Not linked*); click it again to clear. Pick
  which sheets it shows under **Sheets**; click a sheet's name to open it.
- **Ask**, on the right, is a chat in English, Filipino or Bikol. Ask *How much is for flood
  control?* and it changes the open sheet, says the figure in two or three sentences, and lists
  the five biggest PPAs it counted; **See all** shows every one of them. Themes such as flood
  control, health or senior citizens are counted from **what each PPA is**, whichever office runs
  it: a drainage canal under the Environment Office counts as flood control. A note under the
  answer says how it was counted and how much could not be classified. Buttons offer the next
  step (by office, by kind of work, by fund, over the years) or another reading of your question.
  Ask a follow-up (*what about 2026?*, *only the City Engineer*) and it changes the same sheet.
  Underlined budget words explain themselves when you point at or tap them. **Undo** puts the
  sheet back. Every figure comes from the data, never from the AI.
  **Each sheet has its own chat**: switch sheets and you see that sheet's conversation, and an
  answer always changes the sheet you asked it on, even if you moved to another one meanwhile.
  The eraser button at the top of the chat clears the open sheet's conversation (the chart stays;
  use **Undo** for that). On a blank sheet the chat starts afresh and picks its own breakdown.
- **Undo and redo** (Ctrl+Z, Ctrl+Shift+Z) work on every change. The sun or moon button switches
  between light and dark.

### Getting started: the guide

A new workbook opens on a **blank sheet**. It shows the total for the latest plan and three ways
to start:

1. **Ask** a question in the chat on the right, like *health spending in 2027*.
2. **Drag a field**, such as Office, from the list on the left onto **Rows**, or just click it.
3. **Open a starter workbook**: a finished set of charts to look at and change. There is one for
   the latest AIP (by office, finish line and type of expense, on a dashboard), its climate change
   spending, the city's income, and the budget over the years. Opening one replaces your workbook;
   **Undo** brings yours back.

**+** at the bottom also opens a blank sheet.

The **?** button at the top right (or the **?** key) opens the **Guide**:

- **How to use it**: the three ways to start, the starter workbooks, short how-tos (make a chart,
  compare years, filter, look closer, see the records, put charts side by side, share), what each
  source holds, and the keyboard shortcuts.
- **About the data**: which documents and years the explorer holds (drafts are marked), the three
  words for money, what a draft is, and things to know before reading a chart.

The three words for money are not the same money, so the explorer never adds them together:

| Word | Document | What it means |
|---|---|---|
| **Estimated cost** | Annual Investment Program (AIP) | What a planned program is expected to cost. The plan lists more than the city can afford, so it is not a budget. |
| **Proposed budget** | Local Expenditure Program (LEP) | What the Mayor asks the Sangguniang Panlungsod to approve, cut to fit the expected income. |
| **Appropriation** | Appropriation ordinance | What the Sangguniang Panlungsod passes into law: permission to spend up to that amount. |

A **draft** is a document the city has not published yet. Drafts appear only on test copies of the
site, marked *Draft* and striped, and their figures may change.

Your workbook is **saved in this browser** only, not on a server. **Share → Copy a link** stores a
copy of it and copies a link; whoever opens the link gets their own copy to change. A link names
only what the workbook shows and its sheet names: never you, and never what you asked. **Share**
also downloads the chart as a picture (PNG or SVG) or its figures as a spreadsheet (CSV). A
picture carries its own title and the line under it, the key, the documents it comes from, the
date, a link back to exactly this chart, and a short code for the question it answers, so anyone
who sees it can check it.

## Asking a question

Type a question in the box at the top, in English, Filipino or Bikol: *How much goes to health in
2027?* You can also speak it with your phone's voice typing. The explorer turns it into a chart
and says what it understood. When it had to guess something you did not say (the year, or how to
break the money down), it says so, and you can change that menu under the box. Your question is
not put in the page address, so a shared link shows the chart, not what you asked.

Where the site offers it, **Speak** records your question (up to 10 seconds). What was heard
appears in the box for you to check and correct before you press **Ask**. The recording is turned
into words and then thrown away; it is not kept.

Where the city has switched it on, a box under the question reads **Help improve the explorer**.
It starts unticked. Tick it only if you are happy for the city to keep that question to teach its
model. Names and contact details are taken out first, and a question that still seems to name a
person is not kept at all. Leave it unticked and nothing you type is kept for this. The Privacy
Policy says more.

Some questions are answered from a list of common ones. When new questions are resting for the
day, the box offers those instead.

## Making a chart

The sentence above the chart says what it shows. Each underlined part is a menu:

> Showing **Amount** of **FY2027 Annual Investment Program** by **Sector** as **Bars**

- **Amount or Number of programs.** On an Annual Budget the count is of PPAs, as the ordinance lists them.
- **Which document and year.** Every year with published figures appears: the AIP once its programs
  are published, the Annual Budget once its ordinance is enacted.
- **Broken down by** office, sector, fund, finish line, cluster, theme, expense class or year.
- **Shown as** bars, stacked bars, a line over the years, or a table only.

**Compare with** puts a second document or year beside the first. The plan (AIP), the Mayor's
proposal (LEP) and the enacted budget (ordinance) are different money, so the explorer shows them
side by side and never adds or stacks them. A note under the sentence says so.

**Filters** narrows the chart, for example to one office or one fund. Before you apply them, the
button says how much the chart would show ("Show 214 items · ₱1.2B"). Each filter shows as a chip
you can remove.

The table under the chart always holds the same figures. On a phone, long rankings show as the
table only.

## Explain this chart

**Explain this chart**, under the chart, opens a short reading of it: the total, the largest and
smallest parts, the biggest change over the years, what the figures do not tell you, and which
documents they come from. It is written by fixed sentences from the figures in the table, not by
AI, in English, Filipino or Bikol. Tap a figure to jump to its row in the table.

Under it, **Was this explanation right?** takes a Yes, No (with what was wrong) or Not sure. No
name or address is sent, only the chart and the answer.

## Things the explorer will not do

- Add up themes or labels. A program can carry several, so they do not sum to the total.
- Say how much was *spent*. The AIP plans, the proposed budget proposes and the ordinance
  appropriates; none of them records spending.
- Stack the plan, the proposal and the enacted budget on one bar.
- Show a year, or a program, that is not yet published on the site.

## Sharing

The Overview and Browse pages of a year the explorer holds have an **Explore this**
link under their tables, which opens the same figures here to change.

A shared link shows a picture of the chart itself on Facebook and Messenger. The page address is
the chart: copy it, or use **Share or download** for Facebook, a picture
(PNG or SVG with the title and source on it), or the figures as CSV or Excel.

## For administrators

The page appears only when the deployment sets `EXPLORER_ENABLED=1` (API) and
`NEXT_PUBLIC_EXPLORER_ENABLED=1` (site). Which years appear follows each year's open-data switch.
Answering new questions with AI also needs `EXPLORER_AI_ENABLED=1`; without it the box answers
from the common questions only. **Speak** also needs `STT_PROVIDER` (`omnilingual`, which hears
English, Filipino and Bikol, or `azure`, which hears English and Filipino only).

Staff with the **Read the Data Explorer question log** permission see what was asked, how it was
answered and residents' verdicts under **Control Panel → Explorer Questions**, and above it the
model spend per day (the chat, and labelling runs apart). Question text is erased after 12 months;
email addresses and phone numbers in it are removed before it is stored.

**Labels** (what each PPA is) come from a labelling run Stride starts after each import:
`pnpm --filter api db:label`. It reads only rows whose text changed. Labels the model was unsure of
wait for review: `db:label:review -- export` writes a sheet, Stride fills in the decision column,
and `db:label:review -- apply <sheet>` puts the decisions in; a reviewed row is never labelled
again.

Technical reference: [`docs/modules/data-explorer.md`](../modules/data-explorer.md).
