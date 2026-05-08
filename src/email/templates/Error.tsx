import { Html, Body, Container, Heading, Text, Link } from "@react-email/components";
import * as React from "react";

export interface ErrorProps {
  date: string;
  stage: string;
  message: string;
  runUrl?: string;
}

export const ErrorMail: React.FC<ErrorProps> = (p) => (
  <Html>
    <Body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <Container>
        <Heading>⚠️ Pipeline-fout op {p.date}</Heading>
        <Text>Stage: <strong>{p.stage}</strong></Text>
        <Text>Error: <code>{p.message}</code></Text>
        {p.runUrl && <Text><Link href={p.runUrl}>Bekijk Actions-run</Link></Text>}
      </Container>
    </Body>
  </Html>
);
