import { Html, Body, Container, Heading, Text } from "@react-email/components";
import * as React from "react";

export interface CapReachedProps {
  title: string;
  weightedTotal: number;
  weeklyCap: number;
  publishedThisWeek: number;
}

export const CapReached: React.FC<CapReachedProps> = (p) => (
  <Html>
    <Body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <Container>
        <Heading>📦 Cap bereikt — draft bewaard</Heading>
        <Text><strong>{p.title}</strong> haalde {p.weightedTotal.toFixed(1)} / 10.</Text>
        <Text>Deze week zijn al {p.publishedThisWeek}/{p.weeklyCap} concepten gepubliceerd. De draft staat als bijlage.</Text>
      </Container>
    </Body>
  </Html>
);
