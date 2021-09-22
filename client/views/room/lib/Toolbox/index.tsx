import { FC, LazyExoticComponent, ReactNode, MouseEvent } from 'react';
import { Emitter, Handler } from '@rocket.chat/emitter';
import { BoxProps, OptionProps } from '@rocket.chat/fuselage';

import { IRoom } from '../../../../../definition/IRoom';

type ToolboxHook = ({ room }: { room: IRoom }) => ToolboxActionConfig | null

type ActionRendererProps = Omit<ToolboxActionConfig, 'renderAction' | 'groups'> & {
	className: BoxProps['className'];
	tabId: ToolboxActionConfig['id'] | undefined;
	index: number;
}

export type ActionRenderer = (props: ActionRendererProps) => ReactNode;

type OptionRendererProps = OptionProps;

export type OptionRenderer = (props: OptionRendererProps) => ReactNode;

export type ToolboxActionConfig = {
	id: string;
	icon: string;
	title: string;
	renderAction?: ActionRenderer;
	full?: true;
	renderOption?: OptionRenderer;
	order?: number;
	groups: Array<'group' | 'channel' | 'live' | 'direct' | 'direct_multiple'>;
	hotkey?: string;
	action?: (e: MouseEvent<HTMLElement>) => void;
	template?: string | FC | JSX.Element | LazyExoticComponent<FC>;
}

export type ToolboxAction = ToolboxHook | ToolboxActionConfig;

const ev = new Emitter();

export type ActionsStore = Map<string, ToolboxAction>;

export const actions: ActionsStore = new Map();

export const addAction = (id: ToolboxActionConfig['id'], action: ToolboxAction): ActionsStore => {
	actions.set(id, action);
	ev.emit('change', actions);
	return actions;
};

export const deleteAction = (id: ToolboxActionConfig['id']): boolean => {
	const result = actions.delete(id);
	ev.emit('change', actions);
	return result;
};

export const listen = (handler: Handler): Function => ev.on('change', handler);
