import { IsIn } from 'class-validator';

/**
 * POST /partner/admin/referrals/:id/status — moves a referral through the
 * placement lifecycle. PLACED earns the reward; PAID marks it paid out.
 */
export class AdminReferralStatusDto {
  @IsIn(['REGISTERED', 'IN_PLACEMENT', 'PLACED', 'PAID'])
  status!: 'REGISTERED' | 'IN_PLACEMENT' | 'PLACED' | 'PAID';
}
