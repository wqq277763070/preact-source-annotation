import {
	h,
	createContext,
	cloneElement,
	Component,
	render,
	createRef
} from '../src';

class Root extends Component {
	render() {
		return <div>33333</div>;
	}
}

class App extends Component {
	$ref = createRef();

	state = {
		xx: 1
	};

	componentDidMount() {
		setTimeout(() => {
			this.setState({
				xx: 0
			});
		}, 5000);
	}

	render() {
		return (
			<div>
				23412341
				{this.state.xx === 1 && <Root ref={this.$ref} />}
			</div>
		);
	}
}

render(<App />, document.getElementById('app'));
