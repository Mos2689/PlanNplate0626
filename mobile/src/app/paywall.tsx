// Legacy /paywall route — fully superseded by PaywallSheet.
//
// All in-app paywall entry points now call openPaywallSheet(trigger)
// directly (see src/lib/subscription-store.ts). This route is kept as
// a safety net for: legacy deep links, third-party share URLs, push
// notifications, or any straggling router.push('/paywall') call we
// haven't yet migrated. On mount it opens the sheet and pops itself
// off the stack — the user sees a single bottom sheet, never the old
// full-screen page.

import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSubscriptionStore } from '@/lib/subscription-store';

export default function PaywallRedirect() {
  const router = useRouter();
  const openPaywallSheet = useSubscriptionStore((s) => s.openPaywallSheet);

  useEffect(() => {
    openPaywallSheet('generic');
    // Pop off the modal stack on the next tick so the sheet renders
    // over whatever screen the user was on before the push.
    const t = setTimeout(() => {
      if (router.canGoBack()) router.back();
    }, 0);
    return () => clearTimeout(t);
  }, [openPaywallSheet, router]);

  return <View style={{ flex: 1, backgroundColor: 'transparent' }} />;
}
