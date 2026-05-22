import { Html, Body, Container, Heading, Section, Text } from "@react-email/components";
import * as React from "react";

export interface RejectProps {
  title: string;
  weightedTotal: number;
  scoreBreakdown: Record<string, number>;
  hardFails: string[];
  reasoning: string;
  improvementSuggestions: string[];
}

export const Reject: React.FC<RejectProps> = (p) => (
  <Html>
    <Body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <Container>
        <Heading>❌ Reject — draft viel onder de drempel</Heading>
        <Text><strong>{p.title}</strong></Text>
        <Text>Score: <strong>{p.weightedTotal.toFixed(1)}</strong> / 10 — drempel 8.0</Text>
        {p.hardFails.length > 0 && (
          <Section>
            <Text><strong>Hard fails getriggerd:</strong></Text>
            <ul>
              {p.hardFails.map((h) => {
                // factChecker-fixer kan een "\n→ FIX: <rewrite>" suffix
                // toevoegen aan fabricated-claim entries. Render die op een
                // eigen regel zodat de reviewer 1-klik kan plakken in de
                // editor i.p.v. een wall of text te lezen.
                const idx = h.indexOf("\n→ FIX: ");
                if (idx < 0) return <li key={h}>{h}</li>;
                const claim = h.slice(0, idx);
                const fix = h.slice(idx + "\n→ FIX: ".length);
                return (
                  <li key={h}>
                    {claim}
                    <br />
                    <span style={{ color: "#047857", fontStyle: "italic" }}>→ FIX: {fix}</span>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
        <Section>
          <Text>Score-breakdown:</Text>
          <ul>
            {Object.entries(p.scoreBreakdown).map(([k, v]) => (
              <li key={k}>{k}: {v.toFixed(1)}</li>
            ))}
          </ul>
        </Section>
        <Section>
          <Text><strong>Judge reasoning:</strong></Text>
          <Text>{p.reasoning}</Text>
        </Section>
        <Section>
          <Text><strong>Verbeter-suggesties:</strong></Text>
          <ul>{p.improvementSuggestions.map((s) => <li key={s}>{s}</li>)}</ul>
        </Section>
        <Text>De volledige draft + outline staat als bijlage bij deze email.</Text>
      </Container>
    </Body>
  </Html>
);
