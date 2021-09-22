import { ResponsiveHeatMap } from '@nivo/heatmap';
import { Box, Flex, Select, Skeleton, ActionButton } from '@rocket.chat/fuselage';
import React, { useMemo, useState } from 'react';

import {
	getPeriod,
	getDateWithFormat,
	getDate,
	toISODate,
	addDate,
	getDateDiff,
	getDateFormat,
	setDate,
} from '../../../../../../lib/rocketchat-dates';
import { useTranslation } from '../../../../../../client/contexts/TranslationContext';
import { useEndpointData } from '../../../../../../client/hooks/useEndpointData';
import { Section } from '../Section';
import { downloadCsvAs } from '../../../../../../client/lib/download';

export function UsersByTimeOfTheDaySection() {
	const t = useTranslation();

	const periodOptions = useMemo(() => [
		['last 7 days', t('Last_7_days')],
		['last 30 days', t('Last_30_days')],
		['last 90 days', t('Last_90_days')],
	], [t]);

	const [periodId, setPeriodId] = useState('last 7 days');

	const period = useMemo(() => {
		getPeriod(periodId);
	}, [periodId]);

	const handlePeriodChange = (periodId) => setPeriodId(periodId);

	const params = useMemo(() => ({
		start: toISODate(period.start),
		end: toISODate(period.end),
	}), [period]);

	const data = useEndpointData('engagement-dashboard/users/users-by-time-of-the-day-in-a-week', params);

	const [
		dates,
		values,
	] = useMemo(() => {
		if (!data) {
			return [];
		}

		const dates = Array.from({ length: getDateDiff(getDate(period.end), period.start, 'days') + 1 },
			(_, i) => addDate(getDate(period.start), i, 'days'));

		const values = Array.from({ length: 24 }, (_, hour) => ({
			hour: String(hour),
			...dates.map((date) => ({ [toISODate(date)]: 0 }))
				.reduce((obj, elem) => ({ ...obj, ...elem }), {}),
		}));

		for (const { users, hour, day, month, year } of data.week) {
			const date = toISODate(getDate([year, month - 1, day, 0, 0, 0, 0]));
			values[hour][date] += users;
		}

		return [
			dates.map((date) => toISODate(date)),
			values,
		];
	}, [data, period.end, period.start]);

	const downloadData = () => {
		const _data = data.week.map(({
			users,
			hour,
			day,
			month,
			year,
		}) => ({
			date: getDate([year, month - 1, day, hour, 0, 0, 0]),
			users,
		}))
			.sort((a, b) => a > b)
			.map(({ date, users }) => [toISODate(date), users]);
		downloadCsvAs(_data, `UsersByTimeOfTheDaySection_start_${ params.start }_end_${ params.end }`);
	};
	return <Section
		title={t('Users_by_time_of_day')}
		filter={<><Select options={periodOptions} value={periodId} onChange={handlePeriodChange} />{<ActionButton small mis='x16' onClick={downloadData} aria-label={t('Download_Info')} icon='download'/>}</>}
	>
		{data
			? <Box display='flex' style={{ height: 696 }}>
				<Flex.Item align='stretch' grow={1} shrink={0}>
					<Box style={{ position: 'relative' }}>
						<Box style={{ position: 'absolute', width: '100%', height: '100%' }}>
							<ResponsiveHeatMap
								data={values}
								indexBy='hour'
								keys={dates}
								padding={4}
								margin={{
									// TODO: Get it from theme
									left: 40,
									bottom: 20,
								}}
								colors={[
									// TODO: Get it from theme
									'#E8F2FF',
									'#D1EBFE',
									'#A4D3FE',
									'#76B7FC',
									'#549DF9',
									'#1D74F5',
									'#10529E',
								]}
								cellOpacity={1}
								enableLabels={false}
								axisTop={null}
								axisRight={null}
								axisBottom={{
									// TODO: Get it from theme
									tickSize: 0,
									tickPadding: 4,
									tickRotation: 0,
									format: (isoString) => (dates.length === 7 ? getDateFormat(getDate(isoString), 'dddd') : ''),
								}}
								axisLeft={{
									// TODO: Get it from theme
									tickSize: 0,
									tickPadding: 4,
									tickRotation: 0,
									format: (hour) => getDateWithFormat(setDate(getDate(), { hour: parseInt(hour, 10), minute: 0, second: 0 }), 'LT'),
								}}
								hoverTarget='cell'
								animate={dates.length <= 7}
								motionStiffness={90}
								motionDamping={15}
								theme={{
									// TODO: Get it from theme
									axis: {
										ticks: {
											text: {
												fill: '#9EA2A8',
												fontFamily: 'Inter, -apple-system, system-ui, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Helvetica Neue", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Meiryo UI", Arial, sans-serif',
												fontSize: 10,
												fontStyle: 'normal',
												fontWeight: '600',
												letterSpacing: '0.2px',
												lineHeight: '12px',
											},
										},
									},
									tooltip: {
										container: {
											backgroundColor: '#1F2329',
											boxShadow: '0px 0px 12px rgba(47, 52, 61, 0.12), 0px 0px 2px rgba(47, 52, 61, 0.08)',
											borderRadius: 2,
										},
									},
								}}
								tooltip={({ value }) => <Box fontScale='p2' color='alternative'>
									{t('Value_users', { value })}
								</Box>}
							/>
						</Box>
					</Box>
				</Flex.Item>
			</Box>
			: <Skeleton variant='rect' height={696} />}
	</Section>;
}
