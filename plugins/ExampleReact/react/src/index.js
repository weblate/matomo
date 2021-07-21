import * as React from 'react';
import ReactDOM from 'react-dom';

export class WelcomeComponent extends React.Component {
    render() {
        return <h1>Hello, {this.props.name}</h1>;
    }

    static renderTo(element, props) {
        const jsx = <WelcomeComponent {...props}/>;
        // TODO: not sure if there might be memory leaks if the element just disappears
        ReactDOM.render(jsx, element);
    }
}

