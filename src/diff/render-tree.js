import { Component, enqueueRender } from '../component';
import { assign } from '../util';
import options from '../options';
import { Fragment, coerceToVNode } from '../create-element';
import { EMPTY_OBJ, EMPTY_ARR } from '../constants';
import { toChildArray } from '..';

/**
 *
 * @param {*} newVNode
 * @param {*} oldVNode
 * @param {*} force
 * @param {*} context
 * @param {*} nesting
 */
export default function renderTree(
	newVNode,
	oldVNode,
	force,
	context,
) {
	if (typeof newVNode === 'string' || typeof newVNode === 'number') {
		return newVNode;
	}

	let tmp,
		newType = newVNode.type;

	// JSON injection protection
	if (newVNode.constructor !== undefined) return null;

	// TODO: if ((tmp = options._diff)) tmp(newVNode);

	try {
		if (typeof newType === 'function') {
			// -------- 1. construction
			let c, isNew, clearProcessingException;
			let newProps = newVNode.props;

			// Necessary for createContext api. Setting this property will pass
			// the context value as `this.context` just for this component.
			tmp = newType.contextType;
			let provider = tmp && context[tmp._id];
			let cctx = tmp
				? provider
					? provider.props.value
					: tmp._defaultValue
				: context;

			if (oldVNode._component) {
				c = newVNode._component = oldVNode._component;
				clearProcessingException = c._processingException = c._pendingError;
			}
			else {
				if ('prototype' in newType && newType.prototype.render) {
					c = newVNode._component = new newType(newVNode.props, context); // eslint-disable-line new-cap
				}
				else {
					c = newVNode._component = new Component(newVNode.props, context);
					c.constructor = newType;
					c.render = doRender;
				}

				// createContext support
				if (provider) provider.sub(c);

				c.props = newProps;
				if (!c.state) c.state = {};
				c.context = cctx;
				c._context = context;
				isNew = c._dirty = c._isNew = true;
				c._renderCallbacks = [];
			}

			// -------- 2. getDerivedStateFromProps
			if (c._nextState == null) {
				c._nextState = c.state;
			}
			if (newType.getDerivedStateFromProps != null) {
				assign(
					c._nextState == c.state
						? (c._nextState = assign({}, c._nextState))
						: c._nextState,
					newType.getDerivedStateFromProps(newProps, c._nextState)
				);
			}

			// Invoke pre-render lifecycle methods
			if (isNew) {
				// -------- 3a. componentWillMount
				// TODO: support UNSAFE_componentWillMount, etc.
				if (newType.getDerivedStateFromProps == null &&
					c.componentWillMount != null
				)
					c.componentWillMount();
				// TODO: invoke componentDidMount in commit phase: if (c.componentDidMount!=null) mounts.push(c);
			}
			else {
				// -------- 3b. componentWillReceiveProps
				if (
					newType.getDerivedStateFromProps == null &&
					force == null &&
					c.componentWillReceiveProps != null
				) {
					c.componentWillReceiveProps(newProps, cctx);
				}

				// -------- 4. shouldComponentUpdate
				// TODO: revisit this logic as we should not mess with _dom pointers inside renderTree()
				// I guess it is a better approach to re-use the oldVNode as newVNode when sCU === false
				// and use referential equality checks in commit to determine whether a node needs to be updated
				newVNode._shouldComponentUpdate = !force && c.shouldComponentUpdate != null && c.shouldComponentUpdate(newProps, c._nextState, cctx) === false;
				if (newVNode._shouldComponentUpdate) {

					c.props = newProps;
					c.state = c._nextState;
					c._dirty = false;
					c._vnode = newVNode;
					newVNode._children = oldVNode._children;

					return newVNode;
				}

				// -------- 5. componentWillUpdate
				if (c.componentWillUpdate != null) {
					c.componentWillUpdate(newProps, c._nextState, cctx);
				}
			}

			c.context = cctx;
			c.props = newProps;
			c._previousState = c.state;
			c.state = c._nextState;

			if ((tmp = options._render)) tmp(newVNode);

			c._dirty = false;
			c._vnode = newVNode;

			tmp = c.render(c.props, c.state, c.context);
			let isTopLevelFragment = tmp != null && tmp.type == Fragment && tmp.key == null;
			toChildArray(isTopLevelFragment ? tmp.props.children : tmp, newVNode._children=[], coerceToVNode, true);
			renderChildren(newVNode, oldVNode, context);

			if (c.getChildContext != null) {
				context = assign(assign({}, context), c.getChildContext());
			}

			// TODO: diffChildren

			// TODO: what is this base needed for? We don't have any dom here at this stage anymore
			// we might need to set the base during commit
			// c.base = newVNode._dom;

			// TODO: are the setState callbacks at the right position here?
			while ((tmp = c._renderCallbacks.pop())) tmp.call(c);

			if (clearProcessingException) {
				c._pendingError = c._processingException = null;
			}
		}
		else {
			toChildArray(newVNode.props.children, newVNode._children = [], coerceToVNode, true);
			renderChildren(newVNode, oldVNode, context);
		}
	}
	catch (e) {
		options._catchError(e, newVNode, oldVNode);
	}

	return newVNode;
}

function renderChildren(newParentVNode, oldParentVNode, context) {
	let childVNode, i, j, oldVNode;

	let newChildren = newParentVNode._children;
	// This is a compression of oldParentVNode!=null && oldParentVNode != EMPTY_OBJ && oldParentVNode._children || EMPTY_ARR
	// as EMPTY_OBJ._children should be `undefined`.
	let oldChildren = ((oldParentVNode && oldParentVNode._children) || EMPTY_ARR).slice();

	let oldChildrenLength = oldChildren.length;

	for (i=0; i<newChildren.length; i++) {
		childVNode = newChildren[i];

		// TODO: find a way to have this check only in one place instead of 3
		// JSON injection protection
		if (childVNode && childVNode.type && childVNode.constructor !== undefined) return null;

		if (childVNode!=null) {
			childVNode._parent = newParentVNode;
			childVNode._depth = newParentVNode._depth + 1;

			// Check if we find a corresponding element in oldChildren.
			// If found, delete the array item by setting to `undefined`.
			// We use `undefined`, as `null` is reserved for empty placeholders
			// (holes).
			oldVNode = oldChildren[i];

			if (oldVNode===null || (oldVNode && childVNode.key == oldVNode.key && childVNode.type === oldVNode.type)) {
				oldChildren[i] = undefined;
			}
			else {
				// Either oldVNode === undefined or oldChildrenLength > 0,
				// so after this loop oldVNode == null or oldVNode is a valid value.
				for (j=0; j<oldChildrenLength; j++) {
					oldVNode = oldChildren[j];
					// If childVNode is unkeyed, we only match similarly unkeyed nodes, otherwise we match by key.
					// We always match by type (in either case).
					if (oldVNode && childVNode.key == oldVNode.key && childVNode.type === oldVNode.type) {
						oldChildren[j] = undefined;
						break;
					}
					oldVNode = null;
				}
			}

			oldVNode = oldVNode || EMPTY_OBJ;

			// Morph the old element into the new one, but don't append it to the dom yet
			renderTree(childVNode, oldVNode, null, context);
		}
	}
}

/** The `.render()` method for a PFC backing instance. */
function doRender(props, state, context) {
	return this.constructor(props, context);
}

(options)._catchError = function (error, vnode, oldVNode) {

	/** @type {import('../internal').Component} */
	let component;

	for (; vnode = vnode._parent;) {
		if ((component = vnode._component) && !component._processingException) {
			try {
				if (component.constructor && component.constructor.getDerivedStateFromError != null) {
					component.setState(component.constructor.getDerivedStateFromError(error));
				}
				else if (component.componentDidCatch != null) {
					component.componentDidCatch(error);
				}
				else {
					continue;
				}
				return enqueueRender(component._pendingError = component);
			}
			catch (e) {
				error = e;
			}
		}
	}

	throw error;
};