import { Html, Body, Container, Heading, Text } from "@react-email/components";
import * as React from "react";

export interface CwvAlertProps {
  tenant: string;
  date: string;
  poorUrls: { url: string; lcp_ms: number; inp_ms: number; cls: number }[];
  totalChecked: number;
}

export const CwvAlert: React.FC<CwvAlertProps> = (p) => (
  <Html>
    <Body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <Container>
        <Heading>Core Web Vitals waarschuwing — {p.date}</Heading>
        <Text>
          {p.poorUrls.length} van de {p.totalChecked} posts zit in de &quot;poor&quot;-zone.
        </Text>
        <ul>
          {p.poorUrls.map((u) => (
            <li key={u.url}>
              <a href={u.url}>{u.url}</a>: LCP {u.lcp_ms}ms / INP {u.inp_ms}ms / CLS{" "}
              {u.cls.toFixed(3)}
            </li>
          ))}
        </ul>
        <Text>Tenant: {p.tenant}</Text>
      </Container>
    </Body>
  </Html>
);
