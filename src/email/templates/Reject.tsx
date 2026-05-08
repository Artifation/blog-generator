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
            <ul>{p.hardFails.map((h) => <li key={h}>{h}</li>)}</ul>
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
