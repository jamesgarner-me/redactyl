// A dim, blue pterodactyl fixed in the bottom-right corner — pure decoration
// (the Redactyl mascot), behind all content and out of the a11y tree. Layout,
// colour, dimness, and the ≤640px hide live in styles.css (.pterodactyl-mark).

// The raw art carries a wide left margin and ragged trailing space; `tighten`
// collapses it to a minimal bounding box so the fixed `right`/`bottom` inset
// hugs the actual shape rather than the surrounding whitespace.
const ART = `
                                                                                      .::-:.
                                                                               =++#+++====
                                                                         .=*+++===-----.
                                                                      =-#++===---::=
                                           -::-++++++          :-: .=*++===---:::=
                                        :--==++**:            =*##*+++======+++=-
                                      .-====**=               -+****+=------:=
                                    ====-==+*:               :-***+==----::=
                                   --..-+.=--               .=*+==++=--::-.
                                ...-:::-:-.-=+             .==*==----=-:=
                             :.....:..=*...++=            --=*+=-:--:--+
                           ..:-++*#*=.:-====*           .:=-=*=---::--
                             -=--=-     :=-.=+        .-+++=*+=-::=
                          =+-             =..--::=-=-:--=+#*++=--
                         :+#**====-        =..:-===-=**#**+==--=
                     -=+#*++++++++#*-=+=++*=**=:---*=**#*++==-=
                 :+*++=+===+=---====++**+****+===--+===+**++=-       .====
               +*++==-::--=---:::::---==++==++**+++*-::-=++**:      =*#*+=
             =*+-=-::::::=-:-----------::-=----+++*+==-==++=+*++++-.==-
           =*+--==-.. .                    .        .=*##  ++***-
          *+=.                                         -++*+    =+-
         +                                                 -*+:  +.
`;

function tighten(art: string): string {
  const lines = art.replace(/[ \t]+$/gm, '').split('\n');
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const indent = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length),
  );
  return lines.map((l) => l.slice(indent)).join('\n');
}

const MARK = tighten(ART);

export function PterodactylMark() {
  return (
    <pre className="pterodactyl-mark" aria-hidden="true">
      {MARK}
    </pre>
  );
}
