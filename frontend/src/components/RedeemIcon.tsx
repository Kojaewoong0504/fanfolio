type RedeemIconName = 'scan' | 'photo' | 'code' | 'back' | 'chevron'

export function RedeemIcon({ name }: { name: RedeemIconName }) {
  const paths = {
    scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8M12 8v8',
    photo: 'M4 6a2 2 0 0 1 2-2h2l1.2-1.5h5.6L16 4h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6ZM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    code: 'M8 8 4 12l4 4M16 8l4 4-4 4M14 5l-4 14',
    back: 'm15 18-6-6 6-6',
    chevron: 'm9 18 6-6-6-6',
  } as const
  return <span className="redeem-method-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d={paths[name]} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg></span>
}
