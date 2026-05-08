import { Html, Body, Container, Heading, Section, Text, Link, Img } from "@react-email/components";
import * as React from "react";

export interface SuccessProps {
  title: string;
  weightedTotal: number;
  scoreBreakdown: Record<string, number>;
  tldr: string;
  imageUrl: string;
  editUrl: string;
  previewUrl: string;
  targetKeyword: string;
  internalLinksUsed: { url: string; anchor: string }[];
}

export const Success: React.FC<SuccessProps> = (p) => (
  <Html>
    <Body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <Container>
        <Heading>✅ Concept klaar voor review</Heading>
        <Text><strong>{p.title}</strong></Text>
        <Text>Score: <strong>{p.weightedTotal.toFixed(1)}</strong> / 10</Text>
        <Section>
          <Text>Score-breakdown:</Text>
          <ul>
            {Object.entries(p.scoreBreakdown).map(([k, v]) => (
              <li key={k}>{k}: {v.toFixed(1)}</li>
            ))}
          </ul>
        </Section>
        <Img src={p.imageUrl} alt="featured" width={600} />
        <Section>
          <Text>{p.tldr}</Text>
        </Section>
        <Section>
          <Link href={p.editUrl}>📝 Open in WordPress (concept)</Link><br />
          <Link href={p.previewUrl}>👁️ Live preview</Link>
        </Section>
        <Text>Target keyword: <code>{p.targetKeyword}</code></Text>
        <Text>Internal links gebruikt:</Text>
        <ul>
          {p.internalLinksUsed.map((l) => (
            <li key={l.url}><a href={l.url}>{l.anchor}</a></li>
          ))}
        </ul>
      </Container>
    </Body>
  </Html>
);
