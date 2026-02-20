import { Text, View } from 'react-native';

export default function IndexScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: '700' }}>Employee Management</Text>
      <Text style={{ marginTop: 8, textAlign: 'center' }}>
        Mobile app shell ready for onboarding, attendance, and profile workflows.
      </Text>
    </View>
  );
}
