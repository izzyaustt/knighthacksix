// Decorative plants behind the sign-in card (from the Figma Make login design). Purely visual.
function TinyFlower({
  className,
  color = "#ef9fa9",
}: {
  className: string
  color?: string
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 44 44"
      fill="none"
    >
      <g fill={color} stroke="#fffaf3" strokeWidth="1.2">
        <ellipse cx="22" cy="11" rx="6" ry="9" />
        <ellipse cx="33" cy="20" rx="6" ry="9" transform="rotate(72 33 20)" />
        <ellipse cx="29" cy="33" rx="6" ry="9" transform="rotate(144 29 33)" />
        <ellipse cx="15" cy="33" rx="6" ry="9" transform="rotate(-144 15 33)" />
        <ellipse cx="11" cy="20" rx="6" ry="9" transform="rotate(-72 11 20)" />
      </g>
      <circle cx="22" cy="22" r="4" fill="#d9a642" />
    </svg>
  )
}

function BotanicalCorner({ side }: { side: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      className={`botanical-corner botanical-corner--${side}`}
      viewBox="0 0 300 430"
      fill="none"
    >
      <g className="botanical-stems" strokeLinecap="round">
        <path d="M20 430C43 341 79 267 166 190C205 155 223 100 235 38" />
        <path d="M48 430C67 349 103 304 180 274C230 255 258 221 279 181" />
        <path d="M5 430C35 364 54 323 53 245C53 205 75 167 109 136" />
        <path d="M78 348C104 318 123 281 128 237" />
      </g>

      <g className="botanical-leaves">
        <ellipse
          cx="77"
          cy="320"
          rx="24"
          ry="11"
          transform="rotate(-38 77 320)"
        />
        <ellipse
          cx="104"
          cy="283"
          rx="23"
          ry="11"
          transform="rotate(29 104 283)"
        />
        <ellipse
          cx="137"
          cy="244"
          rx="22"
          ry="10"
          transform="rotate(-42 137 244)"
        />
        <ellipse
          cx="169"
          cy="208"
          rx="20"
          ry="9"
          transform="rotate(35 169 208)"
        />
        <ellipse
          cx="201"
          cy="160"
          rx="19"
          ry="9"
          transform="rotate(-34 201 160)"
        />
        <ellipse
          cx="226"
          cy="102"
          rx="17"
          ry="8"
          transform="rotate(38 226 102)"
        />
        <ellipse
          cx="67"
          cy="275"
          rx="21"
          ry="10"
          transform="rotate(42 67 275)"
        />
        <ellipse
          cx="52"
          cy="224"
          rx="20"
          ry="9"
          transform="rotate(-39 52 224)"
        />
        <ellipse
          cx="77"
          cy="183"
          rx="19"
          ry="9"
          transform="rotate(35 77 183)"
        />
        <ellipse
          cx="111"
          cy="139"
          rx="18"
          ry="8"
          transform="rotate(-38 111 139)"
        />
        <ellipse
          cx="151"
          cy="301"
          rx="22"
          ry="10"
          transform="rotate(31 151 301)"
        />
        <ellipse
          cx="204"
          cy="264"
          rx="20"
          ry="9"
          transform="rotate(-32 204 264)"
        />
        <ellipse
          cx="247"
          cy="224"
          rx="18"
          ry="8"
          transform="rotate(34 247 224)"
        />
      </g>

      <g className="botanical-veins" strokeLinecap="round">
        <path d="m60 331 33-22M88 274l32 18M121 256l32-24M154 198l31 20M185 171l31-21M215 94l24 16" />
        <path d="m51 263 29 24M35 235l32-23M61 173l31 21M96 148l28-21M136 292l31 18M188 273l31-18M233 215l28 18" />
      </g>

      <g className="large-flower" transform="translate(234 34)">
        <ellipse cx="0" cy="-16" rx="12" ry="20" />
        <ellipse cx="15" cy="-5" rx="12" ry="20" transform="rotate(72 15 -5)" />
        <ellipse cx="9" cy="13" rx="12" ry="20" transform="rotate(144 9 13)" />
        <ellipse
          cx="-9"
          cy="13"
          rx="12"
          ry="20"
          transform="rotate(-144 -9 13)"
        />
        <ellipse
          cx="-15"
          cy="-5"
          rx="12"
          ry="20"
          transform="rotate(-72 -15 -5)"
        />
        <circle r="7" />
      </g>
      <g className="small-flower" transform="translate(110 129)">
        <ellipse cy="-11" rx="8" ry="13" />
        <ellipse cy="-11" rx="8" ry="13" transform="rotate(72)" />
        <ellipse cy="-11" rx="8" ry="13" transform="rotate(144)" />
        <ellipse cy="-11" rx="8" ry="13" transform="rotate(216)" />
        <ellipse cy="-11" rx="8" ry="13" transform="rotate(288)" />
        <circle r="5" />
      </g>
      <g className="small-flower" transform="translate(280 177) scale(.8)">
        <ellipse cy="-11" rx="8" ry="13" />
        <ellipse cy="-11" rx="8" ry="13" transform="rotate(72)" />
        <ellipse cy="-11" rx="8" ry="13" transform="rotate(144)" />
        <ellipse cy="-11" rx="8" ry="13" transform="rotate(216)" />
        <ellipse cy="-11" rx="8" ry="13" transform="rotate(288)" />
        <circle r="5" />
      </g>
    </svg>
  )
}

export function SignInFlowers() {
  return (
    <>
    <BotanicalCorner side="left" />
    <BotanicalCorner side="right" />

    <TinyFlower className="floating-flower floating-flower--one" />
    <TinyFlower
      className="floating-flower floating-flower--two"
      color="#f4b6bd"
    />
    <TinyFlower
      className="floating-flower floating-flower--three"
      color="#e9a4af"
    />
    <TinyFlower
      className="floating-flower floating-flower--four"
      color="#f1aab5"
    />

    <div className="petal-rain" aria-hidden="true">
      <span className="petal petal--one" />
      <span className="petal petal--two" />
      <span className="petal petal--three" />
      <span className="petal petal--four" />
      <span className="petal petal--five" />
      <span className="petal petal--six" />
      <span className="petal petal--seven" />
      <span className="petal petal--eight" />
    </div>
    </>
  );
}
