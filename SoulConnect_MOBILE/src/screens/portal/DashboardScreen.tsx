import React, {useEffect, useState} from 'react';
import {ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useAuth} from '../../context/AuthContext';
import {StaffStackParamList} from '../../navigation/types';
import {fetchDashboard} from '../../services/api';
import {Grid} from '../../components/ui/Grid';
import {colors, radii} from '../../theme/colors';
import {centered, maxWidths, useResponsive} from '../../theme/responsive';

type Props = NativeStackScreenProps<StaffStackParamList, 'Dashboard'>;

export function DashboardScreen(_props: Props) {
  const {token} = useAuth();
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [districts, setDistricts] = useState<Array<{district: string; count: number}>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const r = useResponsive();

  const load = async () => {
    const result = await fetchDashboard(token);
    if (result.ok && result.data?.success) {
      setStats(result.data.stats || null);
      setDistricts(result.data.topDistricts || []);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    load();
  }, [token]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.plum} />
      </View>
    );
  }

  const cards = [
    ['Profiles', stats?.totalCustomers],
    ['Approved', stats?.approvedCustomers],
    ['Pending', stats?.pendingCustomers],
    ['Subscriptions', stats?.totalSubscriptions],
    ['Transactions', stats?.totalTransactions],
    ['Revenue', stats?.totalRevenue],
  ];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, {padding: r.gutter}, centered(maxWidths.wide)]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <Grid columns={r.sizeClass === 'expanded' ? 3 : r.isCompact ? 2 : 3}>
        {cards.map(([label, value]) => (
          <View key={String(label)} style={styles.card}>
            <Text style={styles.value}>{value ?? '—'}</Text>
            <Text style={styles.label}>{label}</Text>
          </View>
        ))}
      </Grid>
      <Text style={styles.heading}>Top districts</Text>
      <Grid columns={r.isCompact ? 1 : 2} gap={8}>
        {districts.map(item => (
          <View key={item.district} style={styles.district}>
            <Text style={styles.districtName}>{item.district}</Text>
            <Text style={styles.districtCount}>{item.count}</Text>
          </View>
        ))}
      </Grid>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  scroll: {backgroundColor: colors.surface},
  content: {padding: 16},
  card: {flex: 1, backgroundColor: colors.white, borderRadius: radii.md, padding: 14},
  value: {fontSize: 24, fontWeight: '800', color: colors.ink},
  label: {color: colors.ink40, marginTop: 4},
  heading: {fontSize: 18, fontWeight: '700', color: colors.ink, marginVertical: 8},
  district: {flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.white, padding: 14, borderRadius: radii.sm},
  districtName: {color: colors.ink, fontWeight: '600'},
  districtCount: {color: colors.plum, fontWeight: '700'},
});
