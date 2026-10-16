import type { components } from './generated';

/** Alias legibles de los esquemas GENERADOS del contrato (no se redefine nada). */
type Schemas = components['schemas'];

export type Profile = Schemas['ProfileDto'];
export type Session = Schemas['SessionDto'];
export type Identity = Schemas['IdentityDto'];
export type Activity = Schemas['ActivityDto'];
export type MfaStatus = Schemas['MfaStatusDto'];
export type TotpSetup = Schemas['TotpSetupDto'];
export type Project = Schemas['ProjectDto'];
export type ProjectList = Schemas['ProjectListDto'];
export type ProjectCounts = Schemas['ProjectCountsDto'];
export type Members = Schemas['MembersDto'];
export type Member = Schemas['MemberDto'];
export type Invitation = Schemas['InvitationDto'];
export type ReceivedInvitation = Schemas['ReceivedInvitationDto'];
export type Tag = Schemas['TagDto'];
export type AuditEvent = Schemas['AuditEventDto'];
export type ChainVerification = Schemas['ChainVerificationDto'];
export type ProjectRole = Project['role'];
export type CompilerEngine = Project['compiler'];
export type InvitableRole = Schemas['InviteMemberDto']['role'];
