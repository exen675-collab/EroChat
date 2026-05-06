import shellHtml from './app-shell.html?raw';

export function App() {
    return <div dangerouslySetInnerHTML={{ __html: shellHtml }} />;
}
