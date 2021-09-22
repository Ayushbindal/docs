import React, { useMemo, FC } from 'react';

import { useSetting } from '../contexts/SettingsContext';
import { AvatarUrlContext } from '../contexts/AvatarUrlContext';
import { roomTypes } from '../../app/utils/client';

const AvatarUrlProvider: FC = ({ children }) => {
	const cdnAvatarUrl = String(useSetting('CDN_PREFIX') || '');
	const externalProviderUrl = String(useSetting('Accounts_AvatarExternalProviderUrl') || '');
	const contextValue = useMemo(() => ({
		getUserPathAvatar: ((): (uid: string, etag?: string) => string => {
			if (externalProviderUrl) {
				return (uid: string): string => externalProviderUrl.trim().replace(/\/+$/, '').replace('{username}', uid);
			}
			if (cdnAvatarUrl) {
				return (uid: string, etag?: string): string => `${ cdnAvatarUrl }/avatar/${ uid }${ etag ? `?etag=${ etag }` : '' }`;
			}
			return (uid: string, etag?: string): string => `/avatar/${ uid }${ etag ? `?etag=${ etag }` : '' }`;
		})(),
		getRoomPathAvatar: ({ type, ...room }: any): string => roomTypes.getConfig(type || room.t).getAvatarPath({ username: room._id, ...room }),
	}), [externalProviderUrl, cdnAvatarUrl]);

	return <AvatarUrlContext.Provider children={children} value={contextValue} />;
};

export default AvatarUrlProvider;
