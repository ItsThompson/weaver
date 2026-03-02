import { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import AppLayout from '@cloudscape-design/components/app-layout';
import SideNavigation, { type SideNavigationProps } from '@cloudscape-design/components/side-navigation';
import { SessionsPage } from './pages/SessionsPage';
import { SessionDetailPage } from './pages/SessionDetailPage';
import { CherrypickPage } from './pages/CherrypickPage';
import { useNavigateOnView } from './hooks/useNavigateOnView';
import { useSessionNotifications } from './hooks/useSessionNotifications';
import { NotificationBar } from './components/NotificationBar';

const NAV_ITEMS: SideNavigationProps.Item[] = [
  { type: 'link', text: 'Sessions', href: '/' },
  { type: 'link', text: 'Cherrypick', href: '/cherrypick' },
];

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(true);
  useNavigateOnView();
  useSessionNotifications();

  const handleFollow: SideNavigationProps['onFollow'] = (event) => {
    event.preventDefault();
    navigate(event.detail.href);
  };

  return (
  <>
    <AppLayout
      navigation={
        <SideNavigation
          header={{ text: 'Weaver', href: '/' }}
          items={NAV_ITEMS}
          activeHref={location.pathname}
          onFollow={handleFollow}
        />
      }
      navigationOpen={navOpen}
      onNavigationChange={({ detail }) => setNavOpen(detail.open)}
      content={
        <Routes>
          <Route path="/" element={<SessionsPage />} />
          <Route path="/sessions/:id" element={<SessionDetailPage />} />
          <Route path="/cherrypick" element={<CherrypickPage />} />
        </Routes>
      }
      toolsHide
    />
    <NotificationBar />
  </>
  );
}
