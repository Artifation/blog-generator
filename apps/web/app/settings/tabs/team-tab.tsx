"use client";

import { TeamSection, type TeamMember } from "../team-section";

interface Props {
  members: TeamMember[];
}

export function TeamTab({ members }: Props) {
  return <TeamSection members={members} />;
}
