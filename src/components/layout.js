import React from "react"
import { Link } from "gatsby"

import "../icon.css"

const Layout = ({ location, title, children }) => {
  const rootPath = `${__PATH_PREFIX__}/`
  const isRootPath = location.pathname === rootPath
  let header

  if (isRootPath) {
    header = (
      <div>
        <h1 className="main-heading">
          <Link to="/">{title}</Link>
        </h1>
        <link rel="stylesheet" href="./src/icon.css"/>
        <object alt="" aria-labelledby="Twitter" type="image/svg+xml" data="/icons/twitter.svg" class="object"></object>
        <object alt="" aria-labelledby="Github" type="image/svg+xml" data="/icons/github-logo.svg" class="object"></object>
        <object alt="" aria-labelledby="Discord" type="image/svg+xml" data="/icons/discord.svg" class="discord"></object>
      </div>
    )
  } else {
    header = (
      <Link className="header-link-home" to="/">
        {title}
      </Link>
    )
  }

  return (
    <div className="global-wrapper" data-is-root-path={isRootPath}>
      <header className="global-header">{header}</header>
      <main>{children}</main>
      <footer>
        © {new Date().getFullYear()}, Built with
        {` `}
        <a href="https://www.gatsbyjs.com">Gatsby</a>
      </footer>
    </div>
  )
}

export default Layout
