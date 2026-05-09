import { Html, Body, Container, Heading, Section, Text, Link, Hr } from "@react-email/components";
import * as React from "react";
import type { LinkedInOutput, NewsletterOutput, XThreadOutput } from "@/agents/repurposer";

export interface RepurposedProps {
  blogTitle: string;
  blogUrl: string;
  linkedin: LinkedInOutput;
  newsletter: NewsletterOutput;
  xthread: XThreadOutput;
}

export const Repurposed: React.FC<RepurposedProps> = (p) => (
  <Html>
    <Body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <Container>
        <Heading>Repurposed content voor: {p.blogTitle}</Heading>
        <Text>Drie afgeleide versies — kopieer handmatig naar kanalen.</Text>

        <Hr />
        <Heading as="h2">LinkedIn-post</Heading>
        <Text style={{ whiteSpace: "pre-wrap", border: "1px solid #ccc", padding: 12 }}>{p.linkedin.full_text}</Text>
        <Text><strong>CTA:</strong> {p.linkedin.cta}</Text>

        <Hr />
        <Heading as="h2">Newsletter</Heading>
        <Text><strong>Subject:</strong> {p.newsletter.subject_line}</Text>
        <Text><strong>Preheader:</strong> {p.newsletter.preheader}</Text>
        {/* eslint-disable-next-line react/no-danger */}
        <div dangerouslySetInnerHTML={{ __html: p.newsletter.body_html }} />

        <Hr />
        <Heading as="h2">X-thread</Heading>
        {p.xthread.tweets.map((t, i) => (
          <Text key={i} style={{ border: "1px solid #ccc", padding: 8, marginBottom: 8 }}>
            <strong>{i + 1}/{p.xthread.tweets.length}</strong> {t}
          </Text>
        ))}

        <Hr />
        <Text>Originele blog: <Link href={p.blogUrl}>{p.blogUrl}</Link></Text>
      </Container>
    </Body>
  </Html>
);
