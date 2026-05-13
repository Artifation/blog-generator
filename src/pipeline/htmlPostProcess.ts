// Deterministische cleanup van de SeoEditor HTML voor publish.
// Lost terugkerende model-quirks op die ondanks prompt-instructies blijven verschijnen.
export function postProcessDraftHtml(html: string): string {
  let out = html;

  // 1. Em-dashes: WP rubric devalueert >3 per 1000w; strip om anti-AI-cliche signaal te halen.
  out = out.replace(/\s*—\s*/g, ", ");
  out = out.replace(/—/g, ",");

  // 2. H3-prefix nummers: schrijver zet vaak "1. ", "2. " voor H3-tekst onder een
  //    genummerde H2 ("De 4 verplichtingen"). De WP TOC-plugin nummert auto
  //    ("3.1. 1. Verwerkersovereenkomst") — dat is dubbel-zien. Strip prefix.
  out = out.replace(
    /(<h[34][^>]*>)\s*\d+[.)]\s+/gi,
    (_, tag: string) => tag
  );

  // 3. Bold-italic combinaties: <em><strong>X</strong></em> en omgekeerd geven
  //    in de WP-theme inconsistente kerning/styling. Plat naar enkel <strong>.
  out = out.replace(
    /<em>\s*<strong>([\s\S]*?)<\/strong>\s*<\/em>/gi,
    "<strong>$1</strong>"
  );
  out = out.replace(
    /<strong>\s*<em>([\s\S]*?)<\/em>\s*<\/strong>/gi,
    "<strong>$1</strong>"
  );

  // 4. Achtergebleven markdown-bold: writer levert soms `**term**` ipv <strong>term</strong>.
  //    WP rendert dat letterlijk als asterisken. Converteer naar <strong>.
  //    Alleen binnen tekst-content matchen, niet inside attributen — daarom geen `>...<` check;
  //    asterisken in attributen zijn extreem zeldzaam en triggeren geen rendering-bug.
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");

  return out;
}
